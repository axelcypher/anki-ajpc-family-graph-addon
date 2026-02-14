from __future__ import annotations

import json
import html
import os
import re
import sys
import unicodedata
from typing import Any, Iterable

from aqt import mw
from anki.collection import Collection

from . import logger
from .graph_api_adapter import _get_provider_link_edges_via_main_api
from .graph_config import load_graph_config

_HTML_RE = re.compile(r"<.*?>", re.DOTALL)
_FURIGANA_BR_RE = re.compile(r"\[[^\]]*\]")
_KANJI_RE = re.compile(r"[\u2E80-\u2EFF\u2F00-\u2FDF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")
_LINK_TAG_RE = re.compile(r"\[([^\]|]+)\|\s*([^\]]+?)\s*\]")
_CLOZE_RE = re.compile(r"\{\{c\d+::(.*?)(?:::(.*?))?\}\}", re.DOTALL)
_FORCE_NID_TAG_RE = re.compile(r"^force_nid:(\d+)$", re.IGNORECASE)
_FORCE_NID_VAL_RE = re.compile(r"(\d+)")
_PROVIDER_LAYER_SAFE_RE = re.compile(r"[^a-z0-9_]+")

MAX_COMPONENT_DEPTH = 5
MAX_DIRECT_FAMILY_MEMBERS = 80

_FUGASHI_TAGGER = None
_FUGASHI_READY = False


def _provider_layer_id(provider_id: str) -> str:
    raw = str(provider_id or "").strip().lower()
    safe = _PROVIDER_LAYER_SAFE_RE.sub("_", raw).strip("_")
    if not safe:
        safe = "unknown"
    return f"provider_{safe}"


def _provider_layer_color(provider_id: str) -> str:
    palette = (
        "#f97316",
        "#22c55e",
        "#38bdf8",
        "#eab308",
        "#a78bfa",
        "#fb7185",
        "#10b981",
        "#06b6d4",
        "#84cc16",
        "#f43f5e",
    )
    seed = 0
    txt = str(provider_id or "")
    for idx, ch in enumerate(txt):
        seed += (idx + 1) * ord(ch)
    return palette[seed % len(palette)]


def _resolve_tools_config_getter():
    if mw is not None:
        api = getattr(mw, "_ajpc_graph_api", None)
        if isinstance(api, dict):
            getter = api.get("get_config")
            if callable(getter):
                return getter
        # Self-heal: if main API module is loaded but not bound on mw yet, try binding now.
        for _mod_name, _mod in list(sys.modules.items()):
            if not _mod:
                continue
            _install = getattr(_mod, "install_graph_api", None)
            _get_cfg = getattr(_mod, "get_graph_config", None)
            if not callable(_install) or not callable(_get_cfg):
                continue
            try:
                _install()
            except Exception:
                continue
            api = getattr(mw, "_ajpc_graph_api", None)
            if isinstance(api, dict):
                getter = api.get("get_config")
                if callable(getter):
                    return getter

    for mod_name, mod in list(sys.modules.items()):
        if not mod:
            continue
        if "graph_api" not in str(mod_name or ""):
            continue
        getter = getattr(mod, "get_graph_config", None)
        if callable(getter):
            return getter
    return None


def _tools_vendor_path() -> str | None:
    getter = _resolve_tools_config_getter()
    if not callable(getter):
        return None
    mod_name = str(getattr(getter, "__module__", "") or "").strip()
    if not mod_name:
        return None
    mod = sys.modules.get(mod_name)
    mod_file = str(getattr(mod, "__file__", "") or "").strip() if mod is not None else ""
    if not mod_file:
        return None
    addon_dir = os.path.dirname(os.path.dirname(os.path.abspath(mod_file)))
    vendor = os.path.join(addon_dir, "vendor")
    if os.path.isdir(vendor):
        return vendor
    return None


def _get_tools_config() -> dict[str, Any] | None:
    getter = _resolve_tools_config_getter()
    if not callable(getter):
        return None
    try:
        cfg = getter(reload=True)
    except TypeError:
        try:
            cfg = getter()
        except Exception:
            cfg = None
    except Exception:
        try:
            cfg = getter()
        except Exception:
            cfg = None
    if isinstance(cfg, dict):
        logger.set_enabled(bool(cfg.get("debug_enabled", True)))
    return cfg


def _strip_html(s: str) -> str:
    return _HTML_RE.sub("", s)


def _norm_text(s: str, norm_cfg: dict[str, Any]) -> str:
    s = s or ""
    if norm_cfg.get("strip_html", True):
        s = _strip_html(s)
    if norm_cfg.get("strip_furigana_brackets", False):
        s = _FURIGANA_BR_RE.sub("", s)
    if norm_cfg.get("trim", True):
        s = s.strip()
    if norm_cfg.get("unicode_nfc", True):
        s = unicodedata.normalize("NFC", s)
    if norm_cfg.get("first_token_only", True):
        s = s.split(" ")[0] if s else ""
    return s


def _extract_kanji(s: str) -> list[str]:
    return _KANJI_RE.findall(s or "")


def _parse_link_targets(raw: str) -> tuple[list[tuple[str, int]], int]:
    if not raw:
        return [], 0
    matches = _LINK_TAG_RE.findall(raw)
    out: list[tuple[str, int]] = []
    invalid = 0
    for label, token in matches:
        token = (token or "").strip()
        if not token:
            invalid += 1
            continue
        num = None
        m = re.search(r"(?:nid|noteid|note|cid|card|cardid)?\s*(\d+)", token, re.IGNORECASE)
        if m:
            try:
                num = int(m.group(1))
            except Exception:
                num = None
        elif token.isdigit():
            try:
                num = int(token)
            except Exception:
                num = None
        if num is None:
            invalid += 1
            continue
        out.append((label.strip(), num))
    return out, invalid


def _parse_family_field(raw: str, sep: str, default_prio: int) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    if not raw:
        return out
    for part in raw.split(sep or ";"):
        p = part.strip()
        if not p:
            continue
        if "@" in p:
            left, right = p.rsplit("@", 1)
            fid = unicodedata.normalize("NFC", left.strip())
            if not fid:
                continue
            try:
                prio = int(right.strip())
            except Exception:
                prio = default_prio
            out.append((fid, prio))
        else:
            fid = unicodedata.normalize("NFC", p)
            if fid:
                out.append((fid, default_prio))
    return out


def _extract_first_cloze_target(note, norm_cfg: dict[str, Any]) -> str:
    try:
        for fname in note.keys():
            raw = str(note[fname] or "")
            if not raw:
                continue
            m = _CLOZE_RE.search(raw)
            if not m:
                continue
            return _norm_text(_strip_html(m.group(1) or ""), norm_cfg)
    except Exception:
        pass
    return ""


def _parse_force_nid(note) -> int | None:
    for fname in ("force_nid", "ForceNid", "forceNid", "Force NID"):
        try:
            if fname not in note:
                continue
            raw = str(note[fname] or "").strip()
            if not raw:
                continue
            m = _FORCE_NID_VAL_RE.search(raw)
            if m:
                return int(m.group(1))
        except Exception:
            continue
    try:
        for tag in note.tags or []:
            m = _FORCE_NID_TAG_RE.match(str(tag or "").strip())
            if m:
                return int(m.group(1))
    except Exception:
        pass
    return None


def _fugashi_tagger():
    global _FUGASHI_READY, _FUGASHI_TAGGER
    if _FUGASHI_READY:
        return _FUGASHI_TAGGER
    _FUGASHI_READY = True
    try:
        import fugashi  # type: ignore

        _FUGASHI_TAGGER = fugashi.Tagger()
        return _FUGASHI_TAGGER
    except Exception:
        pass
    # Optional fallback to tools vendor (if not globally importable).
    try:
        tools_vendor = _tools_vendor_path()
        if tools_vendor and tools_vendor not in sys.path:
            sys.path.insert(0, tools_vendor)
        import fugashi  # type: ignore

        _FUGASHI_TAGGER = fugashi.Tagger()
    except Exception:
        _FUGASHI_TAGGER = None
    return _FUGASHI_TAGGER


def _lemma_from_surface(surface: str, norm_cfg: dict[str, Any]) -> tuple[str, str]:
    s = _norm_text(surface or "", norm_cfg)
    if not s:
        return "", "empty_surface"
    tagger = _fugashi_tagger()
    if tagger is None:
        return s, "lemma_backend_unavailable"
    try:
        tokens = [t for t in tagger(s) if str(getattr(t, "surface", "") or "").strip()]
    except Exception:
        return s, "lemma_backend_failed"
    if len(tokens) != 1:
        return s, "ambiguous_tokenization"
    tok = tokens[0]
    feat = getattr(tok, "feature", None)
    lemma = (
        getattr(feat, "lemma", None)
        or getattr(feat, "dictionary_form", None)
        or getattr(feat, "base_form", None)
        or str(getattr(tok, "surface", "") or "")
    )
    lemma = str(lemma or "").strip()
    if not lemma or lemma == "*":
        lemma = str(getattr(tok, "surface", "") or "").strip()
    return _norm_text(lemma, norm_cfg), "ok"


def _note_label(note, prefer_field: str | None = None) -> str:
    try:
        if prefer_field and prefer_field in note:
            val = str(note[prefer_field] or "").strip()
            if val:
                return val
        for f in note.fields:
            if f:
                return str(f)
    except Exception:
        pass
    return f"Note {getattr(note, 'id', '')}"


def _note_type_name(col: Collection, mid: int) -> str:
    try:
        model = col.models.get(mid)
        if model and isinstance(model, dict):
            return str(model.get("name", mid))
    except Exception:
        pass
    return str(mid)


def _resolve_note_type_id(col: Collection, raw: Any) -> str:
    try:
        s = str(raw).strip()
    except Exception:
        return ""
    if not s:
        return ""
    if s.isdigit():
        return s
    try:
        for info in col.models.all_names_and_ids():
            if str(info.get("name", "")) == s:
                return str(info.get("id"))
    except Exception:
        pass
    return s


def _normalize_note_type_map(col: Collection, cfg_map: Any) -> dict[str, Any]:
    if not isinstance(cfg_map, dict):
        return {}
    out: dict[str, Any] = {}
    for key, val in cfg_map.items():
        mid = _resolve_note_type_id(col, key)
        if mid:
            out[mid] = val
        else:
            out[str(key)] = val
    return out


def _card_status(queue: int) -> str:
    if queue == -1:
        return "suspended"
    if queue in (-2, -3):
        return "buried"
    return "normal"


def _card_columns(col: Collection) -> set[str]:
    try:
        rows = col.db.all("pragma table_info(cards)")
    except Exception:
        return set()
    out = set()
    for row in rows or []:
        try:
            out.add(str(row[1]))
        except Exception:
            continue
    return out


def _extract_stability(value: Any, memory_state: Any) -> float | None:
    if value is not None:
        try:
            return float(value)
        except Exception:
            pass
    if not memory_state:
        return None
    try:
        if isinstance(memory_state, (bytes, bytearray)):
            memory_state = memory_state.decode("utf-8", "ignore")
        data = json.loads(memory_state)
        if isinstance(data, dict):
            if "stability" in data:
                return float(data["stability"])
            if "s" in data:
                return float(data["s"])
    except Exception:
        return None
    return None


def _card_template_name_map(col: Collection, mid: int) -> dict[int, str]:
    out: dict[int, str] = {}
    try:
        model = col.models.get(int(mid))
    except Exception:
        model = None
    if not isinstance(model, dict):
        return out
    tmpls = model.get("tmpls") or []
    for idx, tmpl in enumerate(tmpls):
        if not isinstance(tmpl, dict):
            continue
        name = str(tmpl.get("name", "")).strip()
        if not name:
            continue
        try:
            ord_val = int(tmpl.get("ord", idx))
        except Exception:
            ord_val = idx
        out[ord_val] = name
    return out


def _build_card_map(col: Collection, nids: list[int]) -> dict[int, list[dict[str, Any]]]:
    out: dict[int, list[dict[str, Any]]] = {}
    if not nids:
        return out
    template_cache: dict[int, dict[int, str]] = {}
    cols = _card_columns(col)
    select_cols = ["id", "nid", "ord", "queue"]
    if "stability" in cols:
        select_cols.append("stability")
    if "memory_state" in cols:
        select_cols.append("memory_state")
    chunk_size = 900
    for idx in range(0, len(nids), chunk_size):
        chunk = nids[idx : idx + chunk_size]
        if not chunk:
            continue
        placeholders = ",".join(["?"] * len(chunk))
        note_mid_by_nid: dict[int, int] = {}
        try:
            note_rows = col.db.all(
                f"select id, mid from notes where id in ({placeholders})",
                *chunk,
            )
        except Exception:
            note_rows = []
        for note_row in note_rows or []:
            try:
                note_mid_by_nid[int(note_row[0])] = int(note_row[1])
            except Exception:
                continue
        try:
            rows = col.db.all(
                f"select {','.join(select_cols)} from cards where nid in ({placeholders})",
                *chunk,
            )
        except Exception:
            continue
        idx_map = {name: i for i, name in enumerate(select_cols)}
        for row in rows or []:
            try:
                cid = row[idx_map["id"]]
                nid = row[idx_map["nid"]]
                ord_val = row[idx_map["ord"]]
                queue = row[idx_map["queue"]]
            except Exception:
                continue
            try:
                nid_int = int(nid)
            except Exception:
                continue
            try:
                ord_int = int(ord_val)
            except Exception:
                ord_int = 0
            try:
                queue_int = int(queue)
            except Exception:
                queue_int = 0
            card_name = ""
            mid_int = note_mid_by_nid.get(nid_int)
            if mid_int is not None:
                by_ord = template_cache.get(mid_int)
                if by_ord is None:
                    by_ord = _card_template_name_map(col, mid_int)
                    template_cache[mid_int] = by_ord
                card_name = str(by_ord.get(ord_int, "")).strip()
            stability = None
            if "stability" in idx_map:
                stability = _extract_stability(row[idx_map["stability"]], None)
            if stability is None and "memory_state" in idx_map:
                stability = _extract_stability(None, row[idx_map["memory_state"]])
            if stability is None:
                try:
                    card_obj = col.get_card(int(cid))
                except Exception:
                    card_obj = None
                if card_obj is not None:
                    try:
                        mem = getattr(card_obj, "memory_state", None)
                        if mem is not None and hasattr(mem, "stability"):
                            stability = float(mem.stability)
                    except Exception:
                        stability = None
                    if stability is None:
                        try:
                            comp = col.compute_memory_state(int(cid))
                            if comp and getattr(comp, "stability", None) is not None:
                                stability = float(comp.stability)
                        except Exception:
                            stability = None
            out.setdefault(nid_int, []).append(
                {
                    "id": int(cid),
                    "ord": ord_int,
                    "name": card_name,
                    "status": _card_status(queue_int),
                    "stability": stability,
                }
            )
    for cards in out.values():
        cards.sort(key=lambda c: c.get("ord", 0))
    return out


def _note_ids_for_query(col: Collection, q: str) -> list[int]:
    try:
        return list(col.find_notes(q))
    except Exception:
        return []


def _note_ids_for_deck(col: Collection, deck_name: str) -> list[int]:
    if not deck_name:
        return []
    dn = (deck_name or "").replace("\\", "\\\\").replace('"', '\\"')
    return _note_ids_for_query(col, f'deck:"{dn}"')


def _note_ids_for_mid(col: Collection, mid: str) -> list[int]:
    if not mid:
        return []
    return _note_ids_for_query(col, f"mid:{mid}")


def build_note_delta(col: Collection, changed_nids: Iterable[int]) -> dict[str, Any]:
    cfg = _get_tools_config()
    if not cfg:
        return {"changed_nids": [], "nodes": [], "edges": [], "meta": {}}

    uniq_nids: list[int] = []
    seen_nids: set[int] = set()
    for raw in changed_nids or []:
        try:
            nid = int(raw or 0)
        except Exception:
            continue
        if nid <= 0 or nid in seen_nids:
            continue
        seen_nids.add(nid)
        uniq_nids.append(nid)
    if not uniq_nids:
        return {"changed_nids": [], "nodes": [], "edges": [], "meta": {}}

    graph_cfg = load_graph_config()
    label_fields = _normalize_note_type_map(col, graph_cfg.get("note_type_label_fields") or {})
    linked_fields = _normalize_note_type_map(col, graph_cfg.get("note_type_linked_fields") or {})
    tooltip_fields = _normalize_note_type_map(col, graph_cfg.get("note_type_tooltip_fields") or {})

    layer_colors = dict(graph_cfg.get("layer_colors") or {})
    link_colors = dict(graph_cfg.get("link_colors") or {})
    layer_styles = dict(graph_cfg.get("layer_styles") or {})
    layer_flow = dict(graph_cfg.get("layer_flow") or {})
    link_strengths = dict(graph_cfg.get("link_strengths") or {})

    changed_set = set(uniq_nids)
    touched_nids: set[int] = set(uniq_nids)
    node_layers: dict[int, set[str]] = {nid: {"notes"} for nid in uniq_nids}
    provider_layer_map: dict[str, str] = {}

    edges: list[dict[str, Any]] = []
    edge_seen: set[tuple[str, str, str, str, str]] = set()

    def _add_edge(src: int, dst: int, layer: str, meta: dict[str, Any]) -> None:
        if src <= 0 or dst <= 0 or src == dst or not layer:
            return
        label = str(meta.get("label", "") or "")
        provider = str(meta.get("provider_id", "") or "")
        group = str(meta.get("group", "") or "")
        key = (str(src), str(dst), str(layer), label, provider + "|" + group)
        if key in edge_seen:
            return
        edge_seen.add(key)
        edges.append(
            {
                "source": str(src),
                "target": str(dst),
                "layer": str(layer),
                "meta": dict(meta),
            }
        )
        touched_nids.add(src)
        touched_nids.add(dst)
        node_layers.setdefault(src, {"notes"}).add(str(layer))
        node_layers.setdefault(dst, {"notes"}).add(str(layer))

    def _resolve_note_id(raw_id: int) -> int:
        try:
            note = col.get_note(int(raw_id))
            if note:
                return int(note.id)
        except Exception:
            pass
        try:
            card = col.get_card(int(raw_id))
            if card:
                return int(card.nid)
        except Exception:
            pass
        return 0

    provider_payload = _get_provider_link_edges_via_main_api(
        uniq_nids,
        include_family=False,
    )
    provider_edges = provider_payload.get("edges") if isinstance(provider_payload, dict) else []
    if isinstance(provider_edges, list):
        for row in provider_edges:
            if not isinstance(row, dict):
                continue
            try:
                source_nid = int(row.get("source_nid") or 0)
                target_nid = int(row.get("target_nid") or 0)
                target_id = int(row.get("target_id") or 0)
            except Exception:
                continue
            if source_nid <= 0 or target_nid <= 0 or source_nid not in changed_set:
                continue
            provider_id = str(row.get("provider_id") or "").strip()
            if not provider_id:
                continue
            layer = _provider_layer_id(provider_id)
            provider_layer_map[layer] = provider_id
            _add_edge(
                source_nid,
                target_nid,
                layer,
                {
                    "provider_id": provider_id,
                    "provider_category": str(row.get("provider_category") or ""),
                    "label": str(row.get("label") or ""),
                    "group": str(row.get("group") or ""),
                    "target_kind": str(row.get("target_kind") or "nid"),
                    "target_id": target_id,
                    "manual": False,
                },
            )

    for source_nid in uniq_nids:
        try:
            note = col.get_note(int(source_nid))
        except Exception:
            continue
        linked_field = str(linked_fields.get(str(note.mid), "") or "").strip()
        if not linked_field or linked_field not in note:
            continue
        raw = str(note[linked_field] or "")
        if not raw:
            continue
        raw = _strip_html(html.unescape(raw))
        raw = raw.replace("ï½œ", "|").replace("ï¼»", "[").replace("ï¼½", "]")
        targets, _invalid = _parse_link_targets(raw)
        for label, ref_id in targets:
            target_nid = _resolve_note_id(int(ref_id))
            if target_nid <= 0:
                continue
            _add_edge(
                source_nid,
                target_nid,
                "note_links",
                {
                    "label": str(label or ""),
                    "manual": True,
                },
            )

    def _note_extra(note: Any) -> list[dict[str, str]]:
        out: list[dict[str, str]] = []
        fields = tooltip_fields.get(str(note.mid)) if isinstance(tooltip_fields, dict) else None
        if not fields:
            return out
        for fname in fields:
            fname = str(fname or "").strip()
            if not fname or fname not in note:
                continue
            val = _strip_html(str(note[fname] or "")).strip()
            if not val:
                continue
            out.append({"name": fname, "value": val})
        return out

    nodes: list[dict[str, Any]] = []
    for nid in sorted(touched_nids):
        try:
            note = col.get_note(int(nid))
        except Exception:
            continue
        layers = sorted(node_layers.get(int(nid), {"notes"}))
        if "notes" not in layers:
            layers.insert(0, "notes")
        nodes.append(
            {
                "id": str(nid),
                "label": _note_label(note, label_fields.get(str(note.mid))),
                "kind": "note",
                "note_type_id": str(note.mid),
                "note_type": _note_type_name(col, int(note.mid)),
                "layers": layers,
                "extra": _note_extra(note),
            }
        )

    if provider_layer_map:
        for layer, provider_id in provider_layer_map.items():
            color = _provider_layer_color(provider_id)
            if not layer_colors.get(layer):
                layer_colors[layer] = color
            if not link_colors.get(layer):
                link_colors[layer] = str(layer_colors.get(layer) or color)
            if not layer_styles.get(layer):
                layer_styles[layer] = "dashed"
            if layer not in layer_flow:
                layer_flow[layer] = True
            if layer not in link_strengths:
                link_strengths[layer] = 1.0

    base_layers = ["notes", "priority", "families", "note_links", "examples", "mass_links", "kanji"]
    all_layers = list(base_layers)
    for layer in sorted(provider_layer_map.keys()):
        if layer not in all_layers:
            all_layers.append(layer)

    return {
        "changed_nids": sorted(int(x) for x in uniq_nids),
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "layers": all_layers,
            "provider_layers": dict(provider_layer_map),
            "layer_colors": layer_colors,
            "link_colors": link_colors,
            "layer_styles": layer_styles,
            "layer_flow": layer_flow,
            "link_strengths": link_strengths,
        },
    }


def _build_kanji_maps(
    col: Collection,
    kanji_mid: str,
    kanji_field: str,
    kanji_alt_field: str,
    radical_mid: str,
    radical_field: str,
    allowed_nids: set[int] | None = None,
) -> tuple[dict[str, list[int]], dict[str, list[int]], dict[int, list[str]]]:
    kanji_map: dict[str, list[int]] = {}
    radical_map: dict[str, list[int]] = {}
    kanji_components: dict[int, list[str]] = {}

    if kanji_mid and kanji_field:
        for nid in _note_ids_for_mid(col, kanji_mid):
            if allowed_nids is not None and nid not in allowed_nids:
                continue
            try:
                note = col.get_note(nid)
            except Exception:
                continue
            vals: list[str] = []
            if kanji_field in note:
                vals.append(str(note[kanji_field] or ""))
            if kanji_alt_field and kanji_alt_field in note:
                vals.append(str(note[kanji_alt_field] or ""))
            chars: list[str] = []
            for v in vals:
                chars.extend(_extract_kanji(v))
            for ch in chars:
                kanji_map.setdefault(ch, []).append(nid)
            kanji_components[nid] = []
            # components field parsed later in build_kanji_edges

    # radicals intentionally ignored in graph view

    return kanji_map, radical_map, kanji_components


def build_graph(col: Collection) -> dict[str, Any]:
    cfg = _get_tools_config()
    if not cfg:
        logger.dbg("config missing: _ajpc_graph_api unavailable")
        return {"nodes": [], "edges": [], "meta": {"error": "missing_tools_config"}}
    debug_enabled = bool(cfg.get("debug_enabled", False)) if isinstance(cfg, dict) else False
    debug_mode = str(cfg.get("debug_mode") or "").strip().lower() if isinstance(cfg, dict) else ""

    graph_cfg = load_graph_config()
    label_fields = _normalize_note_type_map(col, graph_cfg.get("note_type_label_fields") or {})
    linked_fields = _normalize_note_type_map(col, graph_cfg.get("note_type_linked_fields") or {})
    tooltip_fields = _normalize_note_type_map(col, graph_cfg.get("note_type_tooltip_fields") or {})
    visible_note_types = _normalize_note_type_map(col, graph_cfg.get("note_type_visible") or {})
    note_type_colors = _normalize_note_type_map(col, graph_cfg.get("note_type_colors") or {})
    note_type_hubs = _normalize_note_type_map(col, graph_cfg.get("note_type_hubs") or {})
    fg_cfg = cfg.get("family_gate") if isinstance(cfg, dict) else {}
    family_gate_note_types = _normalize_note_type_map(col, (fg_cfg or {}).get("note_types") or {})
    cs_cfg = cfg.get("card_stages") if isinstance(cfg, dict) else {}
    card_stages_note_types = _normalize_note_type_map(col, (cs_cfg or {}).get("note_types") or {})
    kg_cfg = cfg.get("kanji_gate") if isinstance(cfg, dict) else {}
    kanji_vocab_note_types = _normalize_note_type_map(col, (kg_cfg or {}).get("vocab_note_types") or {})
    layer_colors = graph_cfg.get("layer_colors") or {}
    link_colors = graph_cfg.get("link_colors") or {}
    same_prio_edges = bool(graph_cfg.get("family_same_prio_edges", False))
    same_prio_opacity = float(graph_cfg.get("family_same_prio_opacity", 0.6))
    layer_styles = graph_cfg.get("layer_styles") or {}
    layer_flow = graph_cfg.get("layer_flow") or {}
    layer_enabled = graph_cfg.get("layer_enabled") or {}
    link_strengths = graph_cfg.get("link_strengths") or {}
    link_weights = graph_cfg.get("link_weights") or {}
    link_weight_modes = graph_cfg.get("link_weight_modes") or {}
    link_distances = graph_cfg.get("link_distances") or {}
    layer_flow_speed = float(graph_cfg.get("layer_flow_speed", 0.02))
    layer_flow_spacing_mul = float(graph_cfg.get("layer_flow_spacing_mul", 18.0))
    layer_flow_radius_mul = float(graph_cfg.get("layer_flow_radius_mul", 3.6))
    trailing_hub_distance = float(graph_cfg.get("trailing_hub_distance", 18.0))
    soft_pin_radius = float(graph_cfg.get("soft_pin_radius", 140))
    solver_cfg = graph_cfg.get("solver") or {}
    engine_cfg = graph_cfg.get("engine") or {}
    renderer_cfg = graph_cfg.get("renderer") or {}
    node_cfg = graph_cfg.get("node") or {}
    neighbor_scaling = graph_cfg.get("neighbor_scaling") or {}
    family_chain_edges = bool(graph_cfg.get("family_chain_edges", False))
    selected_decks = graph_cfg.get("selected_decks") or []
    reference_auto_opacity = float(graph_cfg.get("reference_auto_opacity", 1.0))
    show_unlinked = bool(graph_cfg.get("show_unlinked", False))
    link_mst_enabled = bool(graph_cfg.get("link_mst_enabled", False))
    hub_damping = bool(graph_cfg.get("hub_damping", False))
    reference_damping = bool(graph_cfg.get("reference_damping", False))
    kanji_tfidf_enabled = bool(graph_cfg.get("kanji_tfidf_enabled", False))
    kanji_top_k_enabled = bool(graph_cfg.get("kanji_top_k_enabled", False))
    try:
        kanji_top_k = int(graph_cfg.get("kanji_top_k") or 0)
    except Exception:
        kanji_top_k = 0
    kanji_quantile_norm = bool(graph_cfg.get("kanji_quantile_norm", False))
    kanji_hubs = bool(graph_cfg.get("kanji_hubs", True))
    kanji_components_enabled = bool(graph_cfg.get("kanji_components_enabled", True))
    kanji_component_style = str(graph_cfg.get("kanji_component_style") or "solid")
    kanji_component_color = str(graph_cfg.get("kanji_component_color") or "")
    try:
        kanji_component_opacity = float(graph_cfg.get("kanji_component_opacity") or 0.6)
    except Exception:
        kanji_component_opacity = 0.6
    kanji_component_focus_only = bool(graph_cfg.get("kanji_component_focus_only", False))
    kanji_component_flow = bool(graph_cfg.get("kanji_component_flow", False))
    card_dot_suspended_color = str(
        graph_cfg.get("card_dot_suspended_color") or "#ef4444"
    )
    card_dot_buried_color = str(
        graph_cfg.get("card_dot_buried_color") or "#f59e0b"
    )
    card_dots_enabled = bool(graph_cfg.get("card_dots_enabled", True))

    logger.dbg("build_graph start")
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    family_edges_direct: list[dict[str, Any]] = []
    family_edges_chain: list[dict[str, Any]] = []
    family_hub_edges_direct: list[dict[str, Any]] = []
    family_hub_edges_chain: list[dict[str, Any]] = []
    hub_members: dict[str, dict[str, Any]] = {}
    autolink_tags: dict[str, set[int]] = {}
    provider_layer_map: dict[str, str] = {}
    provider_layer_ids: set[str] = set()

    allowed_nids: set[int] | None = None
    if isinstance(selected_decks, list) and selected_decks:
        allowed_nids = set()
        for deck_name in selected_decks:
            deck_name = str(deck_name or "").strip()
            if not deck_name:
                continue
            allowed_nids.update(_note_ids_for_deck(col, deck_name))
        logger.dbg("deck filter", "decks=", len(selected_decks), "notes=", len(allowed_nids))

    def _filter_nids(nids: list[int]) -> list[int]:
        if allowed_nids is None:
            return nids
        return [nid for nid in nids if nid in allowed_nids]

    def _note_extra(note) -> list[dict[str, str]]:
        extra: list[dict[str, str]] = []
        fields = tooltip_fields.get(str(note.mid)) if isinstance(tooltip_fields, dict) else None
        if not fields:
            return extra
        for fname in fields:
            fname = str(fname or "").strip()
            if not fname or fname not in note:
                continue
            val = _strip_html(str(note[fname] or "")).strip()
            if not val:
                continue
            extra.append({"name": fname, "value": val})
        return extra

    def ensure_node(node_id: str, **kwargs: Any) -> None:
        n = nodes.get(node_id)
        if n is None:
            base = {"id": node_id}
            base.update(kwargs)
            nodes[node_id] = base
        else:
            for k, v in kwargs.items():
                if v is None:
                    continue
                if k in ("label", "extra"):
                    n[k] = v
                elif k not in n:
                    n[k] = v

    def add_layer(node_id: str, layer: str) -> None:
        if not node_id or not layer:
            return
        n = nodes.get(node_id)
        if n is None:
            return
        layers = n.setdefault("layers", [])
        if isinstance(layers, list) and layer not in layers:
            layers.append(layer)

    def add_edge(src: str, dst: str, layer: str, **meta: Any) -> None:
        if src == dst:
            return
        edges.append({"source": src, "target": dst, "layer": layer, "meta": meta})

    def add_family_edge(
        bucket: list[dict[str, Any]], src: str, dst: str, layer: str, **meta: Any
    ) -> None:
        if src == dst:
            return
        bucket.append({"source": src, "target": dst, "layer": layer, "meta": meta})

    def resolve_note_id(raw_id: int) -> int | None:
        try:
            note = col.get_note(raw_id)
            if note:
                return int(note.id)
        except Exception:
            pass
        try:
            card = col.get_card(raw_id)
            if card:
                return int(card.nid)
        except Exception:
            pass
        return None

    # Family Gate (direct + hub)
    fg = cfg.get("family_gate", {})
    if fg.get("enabled"):
        family_field = str(fg.get("family_field") or "")
        sep = str(fg.get("separator") or ";")
        default_prio = int(fg.get("default_prio") or 0)
        note_types = family_gate_note_types
        logger.dbg("family_gate enabled", "field=", family_field, "note_types=", len(note_types))

        family_groups: dict[str, list[tuple[int, int]]] = {}

        for nt_id in note_types.keys():
            nids = _filter_nids(_note_ids_for_mid(col, str(nt_id)))
            logger.dbg("family_gate note_type", nt_id, "notes=", len(nids))
            for nid in nids:
                try:
                    note = col.get_note(nid)
                except Exception:
                    continue
                if family_field not in note:
                    continue
                fams = _parse_family_field(str(note[family_field] or ""), sep, default_prio)
                if not fams:
                    continue
                label = _note_label(note, label_fields.get(str(note.mid)))
                ensure_node(
                    str(nid),
                    label=label,
                    kind="note",
                    note_type_id=str(note.mid),
                    note_type=_note_type_name(col, int(note.mid)),
                    extra=_note_extra(note),
                )
                add_layer(str(nid), "notes")
                for fid, prio in fams:
                    node = nodes.get(str(nid))
                    if node is not None:
                        fam_map = node.setdefault("family_prios", {})
                        if isinstance(fam_map, dict):
                            fam_map[str(fid)] = int(prio)
                    family_groups.setdefault(fid, []).append((nid, prio))

        # build hub edges + direct family edges (limited for performance)
        logger.dbg("family groups", len(family_groups))
        for fid, members in family_groups.items():
            if len(members) < 2 and not show_unlinked:
                continue
            hub_id = f"family:{fid}"
            ensure_node(hub_id, label=fid, kind="family")
            add_layer(hub_id, "families")

            # hub edges (direct variant)
            for nid, prio in members:
                add_family_edge(
                    family_hub_edges_direct,
                    str(nid),
                    hub_id,
                    "families",
                    prio=prio,
                    fid=fid,
                    kind="hub",
                )

            # hub edges (chain variant)
            by_prio: dict[int, list[int]] = {}
            for nid, prio in members:
                by_prio.setdefault(prio, []).append(nid)
            prios = sorted(by_prio.keys())
            if prios:
                lowest = prios[0]
                for nid in by_prio.get(lowest, []):
                    add_family_edge(
                        family_hub_edges_chain,
                        str(nid),
                        hub_id,
                        "families",
                        prio=lowest,
                        fid=fid,
                        kind="hub",
                    )
                for idx in range(1, len(prios)):
                    prev = prios[idx - 1]
                    cur = prios[idx]
                    prev_nodes = by_prio.get(prev, [])
                    if not prev_nodes:
                        continue
                    anchor = prev_nodes[0]
                    for nid in by_prio.get(cur, []):
                        # flow from higher prio -> lower prio (towards hub)
                        add_family_edge(
                            family_hub_edges_chain,
                            str(nid),
                            str(anchor),
                            "families",
                            prio=cur,
                            fid=fid,
                            kind="chain",
                        )

            if 1 < len(members) <= MAX_DIRECT_FAMILY_MEMBERS:
                # direct family edges
                for i in range(len(members)):
                    for j in range(i + 1, len(members)):
                        src, prio = members[i]
                        dst, _prio2 = members[j]
                        if not same_prio_edges and prio == _prio2:
                            continue
                        if prio < _prio2:
                            # flow from higher prio to lower prio
                            add_family_edge(
                                family_edges_direct,
                                str(dst),
                                str(src),
                                "priority",
                                prio=prio,
                                fid=fid,
                                same_prio=False,
                            )
                        elif prio > _prio2:
                            add_family_edge(
                                family_edges_direct,
                                str(src),
                                str(dst),
                                "priority",
                                prio=_prio2,
                                fid=fid,
                                same_prio=False,
                            )
                        else:
                            add_family_edge(
                                family_edges_direct,
                                str(src),
                                str(dst),
                                "priority",
                                prio=prio,
                                fid=fid,
                                same_prio=True,
                            )
                            add_family_edge(
                                family_edges_direct,
                                str(dst),
                                str(src),
                                "priority",
                                prio=prio,
                                fid=fid,
                                same_prio=True,
                                flow_only=True,
                            )

                # chain family edges
                by_prio_members: dict[int, list[int]] = {}
                for nid, prio in members:
                    by_prio_members.setdefault(prio, []).append(nid)
                prio_levels = sorted(by_prio_members.keys())
                # same-priority links (optional)
                if same_prio_edges:
                    for prio, prio_nodes in by_prio_members.items():
                        for i in range(len(prio_nodes)):
                            for j in range(i + 1, len(prio_nodes)):
                                src = prio_nodes[i]
                                dst = prio_nodes[j]
                                add_family_edge(
                                    family_edges_chain,
                                    str(src),
                                    str(dst),
                                    "priority",
                                    prio=prio,
                                    fid=fid,
                                    same_prio=True,
                                )
                                add_family_edge(
                                    family_edges_chain,
                                    str(dst),
                                    str(src),
                                    "priority",
                                    prio=prio,
                                    fid=fid,
                                    same_prio=True,
                                    flow_only=True,
                                )
                # chain links from each higher prio to all lower prio levels (multiple prerequisites)
                for idx in range(1, len(prio_levels)):
                    higher_prio = prio_levels[idx]
                    higher_nodes = by_prio_members.get(higher_prio, [])
                    if not higher_nodes:
                        continue
                    lower_nodes: list[tuple[int, int]] = []
                    for j in range(0, idx):
                        lp = prio_levels[j]
                        for lnid in by_prio_members.get(lp, []):
                            lower_nodes.append((lnid, lp))
                    if not lower_nodes:
                        continue
                    for nid in higher_nodes:
                        for lower_nid, lower_prio in lower_nodes:
                            add_family_edge(
                                family_edges_chain,
                                str(nid),
                                str(lower_nid),
                                "priority",
                                prio=lower_prio,
                                fid=fid,
                                same_prio=False,
                            )

    # Example Gate
    eg = cfg.get("example_gate", {})
    if eg.get("enabled"):
        vocab_deck = str(eg.get("vocab_deck") or "")
        example_deck = str(eg.get("example_deck") or "")
        key_field = str(eg.get("key_field") or eg.get("vocab_key_field") or "").strip()
        norm_cfg = eg.get("key_norm") or {}

        vocab_index: dict[str, list[int]] = {}
        vocab_by_nid: dict[int, str] = {}
        if vocab_deck and key_field:
            for nid in _filter_nids(_note_ids_for_deck(col, vocab_deck)):
                try:
                    note = col.get_note(nid)
                except Exception:
                    continue
                if key_field not in note:
                    continue
                key = _norm_text(str(note[key_field] or ""), norm_cfg)
                if not key:
                    continue
                vocab_index.setdefault(key, []).append(int(nid))
                vocab_by_nid[int(nid)] = key
                ensure_node(
                    str(nid),
                    label=_note_label(note, label_fields.get(str(note.mid))),
                    kind="note",
                    note_type_id=str(note.mid),
                    note_type=_note_type_name(col, int(note.mid)),
                    extra=_note_extra(note),
                )
                add_layer(str(nid), "examples")

        logger.dbg("example_gate vocab keys", len(vocab_index))
        if example_deck and key_field:
            for nid in _filter_nids(_note_ids_for_deck(col, example_deck)):
                try:
                    note = col.get_note(nid)
                except Exception:
                    continue

                source_nid: int | None = None
                lookup_reason = ""
                force_nid = _parse_force_nid(note)
                if force_nid is not None:
                    if int(force_nid) in vocab_by_nid:
                        source_nid = int(force_nid)
                        lookup_reason = "force_nid"
                    else:
                        lookup_reason = "force_nid_not_found"
                if source_nid is None:
                    cloze_surface = _extract_first_cloze_target(note, norm_cfg)
                    if not cloze_surface:
                        continue
                    lemma, lemma_status = _lemma_from_surface(cloze_surface, norm_cfg)
                    candidates = vocab_index.get(lemma, [])
                    if len(candidates) == 1:
                        source_nid = int(candidates[0])
                        lookup_reason = f"lemma:{lemma_status}"
                    elif len(candidates) > 1:
                        continue
                    else:
                        surface_candidates = vocab_index.get(cloze_surface, [])
                        if len(surface_candidates) == 1:
                            source_nid = int(surface_candidates[0])
                            lookup_reason = "surface_match"
                        else:
                            continue

                ensure_node(
                    str(nid),
                    label=_note_label(note, label_fields.get(str(note.mid))),
                    kind="note",
                    note_type_id=str(note.mid),
                    note_type=_note_type_name(col, int(note.mid)),
                    extra=_note_extra(note),
                )
                add_layer(str(nid), "examples")
                add_edge(
                    str(source_nid),
                    str(nid),
                    "examples",
                    key=vocab_by_nid.get(int(source_nid), ""),
                    lookup=lookup_reason,
                )

    # Kanji Gate
    kg = cfg.get("kanji_gate", {})
    if kg.get("enabled"):
        kanji_mid = _resolve_note_type_id(col, kg.get("kanji_note_type") or "")
        kanji_field = str(kg.get("kanji_field") or "")
        kanji_alt_field = str(kg.get("kanji_alt_field") or "")
        components_field = str(kg.get("components_field") or "")
        kanji_rad_field = str(kg.get("kanji_radical_field") or "")
        radical_mid = _resolve_note_type_id(col, kg.get("radical_note_type") or "")
        radical_field = str(kg.get("radical_field") or "")

        if kanji_hubs:
            kanji_chars: set[str] = set()
            component_pairs: list[tuple[str, str]] = []
            radical_pairs: list[tuple[str, str]] = []

            if kanji_mid and kanji_field:
                for nid in _filter_nids(_note_ids_for_mid(col, kanji_mid)):
                    try:
                        note = col.get_note(nid)
                    except Exception:
                        continue
                    vals: list[str] = []
                    if kanji_field in note:
                        vals.append(str(note[kanji_field] or ""))
                    if kanji_alt_field and kanji_alt_field in note:
                        vals.append(str(note[kanji_alt_field] or ""))
                    src_chars: list[str] = []
                    for v in vals:
                        src_chars.extend(_extract_kanji(v))
                    if not src_chars:
                        continue
                    for ch in src_chars:
                        kanji_chars.add(ch)
                    if components_field and components_field in note:
                        comps = _extract_kanji(str(note[components_field] or ""))
                        for src in src_chars:
                            for comp in comps:
                                component_pairs.append((src, comp))
                    # radicals intentionally ignored in graph view

            logger.dbg("kanji_gate hubs", "kanji=", len(kanji_chars), "components=", len(component_pairs))

            def ensure_kanji_hub(ch: str) -> str:
                hub_id = f"kanji:{ch}"
                ensure_node(hub_id, label=ch, kind="kanji_hub")
                return hub_id

            # components edges between kanji hubs
            for src, comp in component_pairs:
                add_edge(ensure_kanji_hub(src), ensure_kanji_hub(comp), "kanji", kind="component", value=comp)

            # vocab -> kanji hubs
            vocab_cfg = kanji_vocab_note_types
            for nt_id, vcfg in vocab_cfg.items():
                if not isinstance(vcfg, dict):
                    continue
                field = str(vcfg.get("reading_field") or vcfg.get("furigana_field") or "").strip()
                if not field:
                    continue
                for nid in _filter_nids(_note_ids_for_mid(col, str(nt_id))):
                    try:
                        note = col.get_note(nid)
                    except Exception:
                        continue
                    if field not in note:
                        continue
                    raw = str(note[field] or "")
                    raw = _FURIGANA_BR_RE.sub("", raw)
                    chars = _extract_kanji(raw)
                    if not chars:
                        continue
                    ensure_node(
                        str(nid),
                        label=_note_label(note, label_fields.get(str(note.mid))),
                        kind="note",
                        note_type_id=str(note.mid),
                        note_type=_note_type_name(col, int(note.mid)),
                        extra=_note_extra(note),
                    )
                    for ch in chars:
                        add_edge(str(nid), ensure_kanji_hub(ch), "kanji", kind="vocab", value=ch)
        else:
            kanji_map, radical_map, _ = _build_kanji_maps(
                col,
                kanji_mid,
                kanji_field,
                kanji_alt_field,
                radical_mid,
                radical_field,
                allowed_nids,
            )
            logger.dbg(
                "kanji_gate maps",
                "kanji=",
                len(kanji_map),
            )

            # map components per kanji note
            if kanji_mid and components_field:
                for nid in _filter_nids(_note_ids_for_mid(col, kanji_mid)):
                    try:
                        note = col.get_note(nid)
                    except Exception:
                        continue
                    if components_field not in note:
                        continue
                    comps = _extract_kanji(str(note[components_field] or ""))
                    for ch in comps:
                        for comp_nid in kanji_map.get(ch, []):
                            ensure_node(
                                str(nid),
                                label=_note_label(note, label_fields.get(str(note.mid))),
                                kind="kanji",
                                note_type_id=str(note.mid),
                                note_type=_note_type_name(col, int(note.mid)),
                                extra=_note_extra(note),
                            )
                            try:
                                comp_note = col.get_note(comp_nid)
                            except Exception:
                                comp_note = None
                            ensure_node(
                                str(comp_nid),
                                label=_note_label(comp_note, label_fields.get(str(comp_note.mid))) if comp_note else ch,
                                kind="kanji",
                                note_type_id=str(comp_note.mid) if comp_note else None,
                                note_type=_note_type_name(col, int(comp_note.mid))
                                if comp_note
                                else "Kanji",
                                extra=_note_extra(comp_note) if comp_note else None,
                            )
                            add_edge(str(nid), str(comp_nid), "kanji", kind="component", value=ch)

            # radicals intentionally ignored in graph view

            # vocab -> kanji
            vocab_cfg = kanji_vocab_note_types
            for nt_id, vcfg in vocab_cfg.items():
                if not isinstance(vcfg, dict):
                    continue
                field = str(vcfg.get("reading_field") or vcfg.get("furigana_field") or "").strip()
                if not field:
                    continue
                for nid in _filter_nids(_note_ids_for_mid(col, str(nt_id))):
                    try:
                        note = col.get_note(nid)
                    except Exception:
                        continue
                    if field not in note:
                        continue
                    raw = str(note[field] or "")
                    raw = _FURIGANA_BR_RE.sub("", raw)
                    chars = _extract_kanji(raw)
                    if not chars:
                        continue
                    ensure_node(
                        str(nid),
                        label=_note_label(note, label_fields.get(str(note.mid))),
                        kind="note",
                        note_type_id=str(note.mid),
                        note_type=_note_type_name(col, int(note.mid)),
                        extra=_note_extra(note),
                    )
                    for ch in chars:
                        for k_nid in kanji_map.get(ch, []):
                            try:
                                knote = col.get_note(k_nid)
                            except Exception:
                                knote = None
                            ensure_node(
                                str(k_nid),
                                label=_note_label(knote, label_fields.get(str(knote.mid))) if knote else ch,
                                kind="kanji",
                                note_type_id=str(knote.mid) if knote else None,
                                note_type=_note_type_name(col, int(knote.mid))
                                if knote
                                else "Kanji",
                                extra=_note_extra(knote) if knote else None,
                            )
                            add_edge(str(nid), str(k_nid), "kanji", kind="vocab", value=ch)

    # Provider links via AJpC Tools Graph API.
    provider_note_ids = sorted(int(n) for n in allowed_nids) if allowed_nids else []
    provider_payload = _get_provider_link_edges_via_main_api(
        provider_note_ids,
        include_family=False,
    )
    provider_edges = provider_payload.get("edges") if isinstance(provider_payload, dict) else []
    if isinstance(provider_edges, list) and provider_edges:
        logger.dbg("provider links", "edges=", len(provider_edges))
        note_cache: dict[int, Any] = {}

        def _cached_note(nid: int):
            if nid in note_cache:
                return note_cache[nid]
            try:
                note_cache[nid] = col.get_note(int(nid))
            except Exception:
                note_cache[nid] = None
            return note_cache[nid]

        for row in provider_edges:
            if not isinstance(row, dict):
                continue
            try:
                source_nid = int(row.get("source_nid") or 0)
                target_nid = int(row.get("target_nid") or 0)
            except Exception:
                continue
            if source_nid <= 0 or target_nid <= 0:
                continue
            if allowed_nids is not None and (
                source_nid not in allowed_nids or target_nid not in allowed_nids
            ):
                continue

            provider_id = str(row.get("provider_id") or "").strip()
            if not provider_id:
                continue
            layer = _provider_layer_id(provider_id)
            provider_layer_map[layer] = provider_id
            provider_layer_ids.add(layer)

            source_note = _cached_note(source_nid)
            target_note = _cached_note(target_nid)
            if source_note is None or target_note is None:
                continue

            ensure_node(
                str(source_nid),
                label=_note_label(source_note, label_fields.get(str(source_note.mid))),
                kind="note",
                note_type_id=str(source_note.mid),
                note_type=_note_type_name(col, int(source_note.mid)),
                extra=_note_extra(source_note),
            )
            ensure_node(
                str(target_nid),
                label=_note_label(target_note, label_fields.get(str(target_note.mid))),
                kind="note",
                note_type_id=str(target_note.mid),
                note_type=_note_type_name(col, int(target_note.mid)),
                extra=_note_extra(target_note),
            )
            add_layer(str(source_nid), layer)
            add_layer(str(target_nid), layer)
            add_edge(
                str(source_nid),
                str(target_nid),
                layer,
                provider_id=provider_id,
                provider_category=str(row.get("provider_category") or ""),
                label=str(row.get("label") or ""),
                group=str(row.get("group") or ""),
                target_kind=str(row.get("target_kind") or "nid"),
                target_id=int(row.get("target_id") or 0),
                manual=False,
            )

    # Manual linked notes (reference)
    if isinstance(linked_fields, dict) and linked_fields:
        manual_edges = 0
        manual_matches = 0
        manual_notes_with_brackets = 0
        manual_invalid = 0
        sample_raw = None
        for nt_id, field in linked_fields.items():
            field = str(field or "").strip()
            if not field:
                continue
            note_count = 0
            for nid in _filter_nids(_note_ids_for_mid(col, str(nt_id))):
                try:
                    note = col.get_note(nid)
                except Exception:
                    continue
                if field not in note:
                    continue
                note_count += 1
                raw = str(note[field] or "")
                if not raw:
                    continue
                raw = _strip_html(html.unescape(raw))
                raw = (
                    raw.replace("｜", "|")
                    .replace("［", "[")
                    .replace("］", "]")
                )
                targets, invalid = _parse_link_targets(raw)
                if not targets:
                    if "[" in raw:
                        manual_notes_with_brackets += 1
                        if sample_raw is None:
                            sample_raw = raw[:120]
                    manual_invalid += invalid
                    continue
                manual_matches += len(targets)
                ensure_node(
                    str(nid),
                    label=_note_label(note, label_fields.get(str(note.mid))),
                    kind="note",
                    note_type_id=str(note.mid),
                    note_type=_note_type_name(col, int(note.mid)),
                    extra=_note_extra(note),
                )
                manual_invalid += invalid
                for label, ref_id in targets:
                    resolved = resolve_note_id(ref_id)
                    if not resolved:
                        continue
                    try:
                        rnote = col.get_note(resolved)
                    except Exception:
                        rnote = None
                    ensure_node(
                        str(resolved),
                        label=_note_label(rnote, label_fields.get(str(rnote.mid)))
                        if rnote
                        else label,
                        kind="note",
                        note_type_id=str(rnote.mid) if rnote else None,
                        note_type=_note_type_name(col, int(rnote.mid))
                        if rnote
                        else "Note",
                        extra=_note_extra(rnote) if rnote else None,
                    )
                    add_edge(
                        str(nid),
                        str(resolved),
                        "note_links",
                        label=label,
                        manual=True,
                    )
                    manual_edges += 1
            if note_count:
                logger.dbg("manual links", "note_type", nt_id, "field", field, "notes", note_count)
        if manual_edges or manual_matches:
            logger.dbg("manual links total", "matches", manual_matches, "edges", manual_edges, "invalid", manual_invalid)
        else:
            logger.dbg(
                "manual links total",
                "matches",
                manual_matches,
                "edges",
                manual_edges,
                "invalid",
                manual_invalid,
                "bracket_notes",
                manual_notes_with_brackets,
            )
            if sample_raw:
                logger.dbg("manual links sample", sample_raw)

    # Include unlinked notes for configured note types (layer-gated)
    if show_unlinked:
        def _add_unlinked_notes(nt_ids: set[str], layer: str) -> None:
            for nt_id in nt_ids:
                nt_id = str(nt_id or "").strip()
                if not nt_id:
                    continue
                for nid in _filter_nids(_note_ids_for_mid(col, nt_id)):
                    try:
                        note = col.get_note(nid)
                    except Exception:
                        continue
                    ensure_node(
                        str(nid),
                        label=_note_label(note, label_fields.get(str(note.mid))),
                        kind="note",
                        note_type_id=str(note.mid),
                        note_type=_note_type_name(col, int(note.mid)),
                        extra=_note_extra(note),
                    )
                    add_layer(str(nid), layer)

        if fg.get("enabled"):
            family_nts = {str(k) for k in (family_gate_note_types or {}).keys() if str(k).strip()}
            if family_nts:
                _add_unlinked_notes(family_nts, "notes")
        if isinstance(cs_cfg, dict) and cs_cfg.get("enabled"):
            stage_nts = {str(k) for k in (card_stages_note_types or {}).keys() if str(k).strip()}
            if stage_nts:
                _add_unlinked_notes(stage_nts, "notes")

        if kg.get("enabled"):
            kanji_nts: set[str] = set()
            if kanji_mid:
                kanji_nts.add(str(kanji_mid))
            if radical_mid:
                kanji_nts.add(str(radical_mid))
            vocab_cfg = kanji_vocab_note_types
            for k in vocab_cfg.keys():
                if str(k).strip():
                    kanji_nts.add(str(k))
            if kanji_nts:
                _add_unlinked_notes(kanji_nts, "kanji")

        if linked_fields:
            ref_nts = {str(k) for k in linked_fields.keys() if str(k).strip()}
            if ref_nts:
                _add_unlinked_notes(ref_nts, "note_links")

    # Collapse duplicate reference edges (manual/auto) into a single visible edge.
    # If both directions exist, keep one visible edge and add a flow-only reverse
    # so the flow appears bidirectional on the same line.
    if edges:
        ref_groups: dict[tuple[str, str, bool], dict[str, list[dict[str, Any]]]] = {}
        out_edges: list[dict[str, Any]] = []
        for e in edges:
            if e.get("layer") != "note_links":
                out_edges.append(e)
                continue
            s = str(e.get("source"))
            t = str(e.get("target"))
            meta = e.get("meta") or {}
            manual = bool(meta.get("manual"))
            a, b = (s, t) if s < t else (t, s)
            entry = ref_groups.setdefault((a, b, manual), {"ab": [], "ba": []})
            if s == a and t == b:
                entry["ab"].append(e)
            else:
                entry["ba"].append(e)
        for (_a, _b, manual), entry in ref_groups.items():
            ab = entry.get("ab") or []
            ba = entry.get("ba") or []
            def _pick(group: list[dict[str, Any]]) -> dict[str, Any] | None:
                for e in group:
                    if not (e.get("meta") or {}).get("flow_only"):
                        return e
                return group[0] if group else None
            vis_ab = _pick(ab)
            vis_ba = _pick(ba)
            if vis_ab and vis_ba:
                visible = vis_ab
                vmeta = dict(visible.get("meta") or {})
                vmeta.pop("flow_only", None)
                vmeta["manual"] = manual
                vmeta["bidirectional"] = True
                visible["meta"] = vmeta
                out_edges.append(visible)
                out_edges.append(
                    {
                        "source": visible.get("target"),
                        "target": visible.get("source"),
                        "layer": "note_links",
                        "meta": {**vmeta, "flow_only": True, "manual": manual, "bidirectional": True},
                    }
                )
            else:
                visible = vis_ab or vis_ba
                if visible is None:
                    continue
                vmeta = dict(visible.get("meta") or {})
                vmeta.pop("flow_only", None)
                vmeta["manual"] = manual
                visible["meta"] = vmeta
                out_edges.append(visible)
        edges = out_edges

    # Aggregate autolink tags into hubs (optional)
    if autolink_tags:
        hub_map: dict[str, str] = {}
        hub_counts: dict[str, int] = {}
        hub_tags: dict[str, str] = {}
        for tag, nids in autolink_tags.items():
            tag = str(tag or "").strip()
            if not tag:
                continue
            hub_id = f"autolink:{tag}"
            hub_tags[hub_id] = tag
            for nid in nids:
                node = nodes.get(str(nid))
                if not node or node.get("kind") != "note":
                    continue
                hub_map[str(nid)] = hub_id
                hub_counts[hub_id] = hub_counts.get(hub_id, 0) + 1
                hub_entry = hub_members.setdefault(hub_id, {"nodes": [], "edges": []})
                hub_entry["nodes"].append(node)
        if hub_map:
            for hub_id, count in hub_counts.items():
                tag = hub_tags.get(hub_id, hub_id)
                entry = hub_members.get(hub_id) or {}
                member_ntids = {
                    str(n.get("note_type_id"))
                    for n in (entry.get("nodes") or [])
                    if n.get("note_type_id")
                }
                mid = member_ntids.pop() if len(member_ntids) == 1 else None
                note_type_name = None
                if mid:
                    try:
                        note_type_name = _note_type_name(col, int(mid))
                    except Exception:
                        note_type_name = mid
                ensure_node(
                    hub_id,
                    label=tag,
                    kind="note_type_hub",
                    note_type_id=mid,
                    note_type=note_type_name or tag,
                    hub_count=count,
                )
            for nid in hub_map.keys():
                nodes.pop(nid, None)
            new_edges: list[dict[str, Any]] = []
            seen: set[tuple[str, str, str, str]] = set()

            def _hub_meta_key(meta: Any) -> str:
                if not isinstance(meta, dict):
                    return ""
                keep: dict[str, Any] = {}
                for k in ("flow_only", "manual", "bidirectional", "kind"):
                    if k in meta:
                        keep[k] = meta.get(k)
                try:
                    return json.dumps(keep, sort_keys=True, default=str)
                except Exception:
                    return str(keep)

            for e in edges:
                raw_src = str(e.get("source"))
                raw_dst = str(e.get("target"))
                src_hub = hub_map.get(raw_src)
                dst_hub = hub_map.get(raw_dst)
                if src_hub and dst_hub and src_hub == dst_hub:
                    hub_entry = hub_members.get(src_hub)
                    if hub_entry is not None:
                        hub_entry["edges"].append(e)
                    continue
                src = src_hub or raw_src
                dst = dst_hub or raw_dst
                if src == dst:
                    continue
                meta = e.get("meta") or {}
                if (
                    str(src).startswith("notetype:")
                    or str(dst).startswith("notetype:")
                    or str(src).startswith("autolink:")
                    or str(dst).startswith("autolink:")
                ):
                    meta_key = _hub_meta_key(meta)
                else:
                    try:
                        meta_key = json.dumps(meta, sort_keys=True, default=str)
                    except Exception:
                        meta_key = str(meta)
                key = (src, dst, str(e.get("layer") or ""), meta_key)
                if key in seen:
                    continue
                seen.add(key)
                new_edges.append({"source": src, "target": dst, "layer": e.get("layer"), "meta": meta})
            edges = new_edges

    if edges:
        node_layers_from_edges = {"families", "examples", "mass_links", "kanji"} | set(
            provider_layer_ids
        )
        for e in edges:
            layer = str(e.get("layer") or "")
            if not layer or layer not in node_layers_from_edges:
                continue
            add_layer(str(e.get("source")), layer)
            add_layer(str(e.get("target")), layer)

    if provider_layer_ids:
        for layer in sorted(provider_layer_ids):
            provider_id = provider_layer_map.get(layer, layer)
            color = _provider_layer_color(provider_id)
            if not layer_colors.get(layer):
                layer_colors[layer] = color
            if not link_colors.get(layer):
                link_colors[layer] = str(layer_colors.get(layer) or color)
            if not layer_styles.get(layer):
                layer_styles[layer] = "dashed"
            if layer not in layer_flow:
                layer_flow[layer] = True
            if layer not in link_strengths:
                link_strengths[layer] = 1.0

    if edges and not show_unlinked:
        linked_ids = {str(e.get("source")) for e in edges} | {str(e.get("target")) for e in edges}
        # include family gate + family hub edges (kept in meta lists)
        for e in (family_edges_direct + family_edges_chain + family_hub_edges_direct + family_hub_edges_chain):
            linked_ids.add(str(e.get("source")))
            linked_ids.add(str(e.get("target")))
        # include hub members (note_type hubs) so hubs/members aren't dropped
        for hub_id, entry in hub_members.items():
            linked_ids.add(str(hub_id))
            for node in (entry.get("nodes") or []):
                if node and node.get("id") is not None:
                    linked_ids.add(str(node.get("id")))
            for e in (entry.get("edges") or []):
                linked_ids.add(str(e.get("source")))
                linked_ids.add(str(e.get("target")))
        nodes = {nid: n for nid, n in nodes.items() if nid in linked_ids}

    note_ids: list[int] = []
    for nid, node in nodes.items():
        if node.get("kind") != "note":
            continue
        try:
            note_ids.append(int(nid))
        except Exception:
            continue
    for hub_entry in hub_members.values():
        for node in hub_entry.get("nodes", []):
            if node.get("kind") != "note":
                continue
            try:
                note_ids.append(int(node.get("id")))
            except Exception:
                continue
    card_map = _build_card_map(col, note_ids)
    for nid, node in nodes.items():
        if node.get("kind") != "note":
            continue
        try:
            node["cards"] = card_map.get(int(nid), [])
        except Exception:
            node["cards"] = []
    for hub_entry in hub_members.values():
        for node in hub_entry.get("nodes", []):
            if node.get("kind") != "note":
                continue
            try:
                node["cards"] = card_map.get(int(node.get("id")), [])
            except Exception:
                node["cards"] = []
    note_type_meta: list[dict[str, Any]] = []
    seen_nt: set[str] = set()

    def add_note_type_meta(node: dict[str, Any]) -> None:
        mid = node.get("note_type_id")
        if not mid or mid in seen_nt:
            return
        seen_nt.add(mid)
        try:
            model = col.models.get(int(mid))
        except Exception:
            model = None
        fields: list[str] = []
        name = mid
        if model and isinstance(model, dict):
            name = str(model.get("name", mid))
            try:
                fields = [str(f.get("name", "")) for f in (model.get("flds") or []) if f.get("name")]
            except Exception:
                fields = []
        note_type_meta.append(
            {
                "id": str(mid),
                "name": name,
                "fields": fields,
                "templates": [
                    str(t.get("name", ""))
                    for t in (model.get("tmpls") or [])
                    if t.get("name")
                ]
                if model and isinstance(model, dict)
                else [],
                "label_field": label_fields.get(str(mid), ""),
                "linked_field": linked_fields.get(str(mid), ""),
                "tooltip_fields": tooltip_fields.get(str(mid), []) if isinstance(tooltip_fields, dict) else [],
                "visible": bool(visible_note_types.get(str(mid), True)),
                "color": note_type_colors.get(str(mid), ""),
                "hub": bool(note_type_hubs.get(str(mid), False)),
            }
        )

    for node in nodes.values():
        if isinstance(node, dict):
            add_note_type_meta(node)
    for hub_entry in hub_members.values():
        for node in hub_entry.get("nodes", []):
            if isinstance(node, dict):
                add_note_type_meta(node)

    hub_members_payload: list[dict[str, Any]] = []
    for hub_id, entry in hub_members.items():
        try:
            nodes_list = entry.get("nodes") or []
            edges_list = entry.get("edges") or []
            hub_members_payload.append(
                {"hub_id": hub_id, "nodes": nodes_list, "edges": edges_list}
            )
        except Exception:
            continue

    deck_names: list[str] = []
    try:
        deck_names = sorted([d.get("name") for d in (col.decks.all_names_and_ids() or []) if d.get("name")])
    except Exception:
        try:
            deck_names = sorted([str(d) for d in col.decks.all_names() if d])
        except Exception:
            deck_names = []

    logger.dbg("build_graph done", "nodes=", len(nodes), "edges=", len(edges))
    base_layers = ["notes", "priority", "families", "note_links", "examples", "mass_links", "kanji"]
    dynamic_provider_layers = sorted(provider_layer_ids)
    all_layers = base_layers + [x for x in dynamic_provider_layers if x not in base_layers]
    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "meta": {
            "layers": all_layers,
            "note_types": note_type_meta,
            "provider_layers": dict(provider_layer_map),
            "layer_colors": layer_colors,
            "link_colors": link_colors,
            "layer_enabled": layer_enabled,
            "family_same_prio_edges": same_prio_edges,
            "family_same_prio_opacity": same_prio_opacity,
            "layer_styles": layer_styles,
            "layer_flow": layer_flow,
            "link_strengths": link_strengths,
            "link_weights": link_weights,
            "link_weight_modes": link_weight_modes,
            "link_distances": link_distances,
            "family_edges_direct": family_edges_direct,
            "family_edges_chain": family_edges_chain,
            "family_hub_edges_direct": family_hub_edges_direct,
            "family_hub_edges_chain": family_hub_edges_chain,
            "layer_flow_speed": layer_flow_speed,
            "layer_flow_spacing_mul": layer_flow_spacing_mul,
            "layer_flow_radius_mul": layer_flow_radius_mul,
            "trailing_hub_distance": trailing_hub_distance,
            "link_settings": {
                "layer_flow_speed": layer_flow_speed,
                "layer_flow_spacing_mul": layer_flow_spacing_mul,
                "layer_flow_radius_mul": layer_flow_radius_mul,
                "trailing_hub_distance": trailing_hub_distance,
                "notes_swatch_color": link_colors.get("notes"),
            },
            "soft_pin_radius": soft_pin_radius,
            "solver": solver_cfg,
            "engine": engine_cfg,
            "renderer": renderer_cfg,
            "node": node_cfg,
            "neighbor_scaling": neighbor_scaling,
            "family_chain_edges": family_chain_edges,
            "reference_auto_opacity": reference_auto_opacity,
            "link_mst_enabled": link_mst_enabled,
            "hub_damping": hub_damping,
            "reference_damping": reference_damping,
            "show_unlinked": show_unlinked,
            "selected_decks": selected_decks,
            "decks": deck_names,
            "card_stages_enabled": bool((cs_cfg or {}).get("enabled", False)),
            "card_stages_note_types": sorted(
                [str(k) for k in (card_stages_note_types or {}).keys() if str(k).strip()]
            ),
            "note_type_hub_members": hub_members_payload,
            "kanji_components_enabled": kanji_components_enabled,
            "kanji_component_style": kanji_component_style,
            "kanji_component_color": kanji_component_color,
            "kanji_component_opacity": kanji_component_opacity,
            "kanji_component_focus_only": kanji_component_focus_only,
            "kanji_component_flow": kanji_component_flow,
            "kanji_tfidf_enabled": kanji_tfidf_enabled,
            "kanji_top_k_enabled": kanji_top_k_enabled,
            "kanji_top_k": kanji_top_k,
            "kanji_quantile_norm": kanji_quantile_norm,
            "card_dot_colors": {
                "suspended": card_dot_suspended_color,
                "buried": card_dot_buried_color,
            },
            "card_dots_enabled": card_dots_enabled,
            "debug_enabled": debug_enabled,
            "debug_mode": debug_mode,
        },
    }
