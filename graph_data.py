from __future__ import annotations

import json
import html
import re
import unicodedata
from typing import Any, Iterable

from aqt import mw
from anki.collection import Collection

from . import logger
from .graph_config import load_graph_config

_HTML_RE = re.compile(r"<.*?>", re.DOTALL)
_FURIGANA_BR_RE = re.compile(r"\[[^\]]*\]")
_KANJI_RE = re.compile(r"[\u2E80-\u2EFF\u2F00-\u2FDF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")
_LINK_TAG_RE = re.compile(r"\[([^\]|]+)\|\s*([^\]]+?)\s*\]")

MAX_COMPONENT_DEPTH = 5
MAX_DIRECT_FAMILY_MEMBERS = 80


def _get_tools_config() -> dict[str, Any] | None:
    if mw is None:
        return None
    api = getattr(mw, "_ajpc_graph_api", None)
    if not isinstance(api, dict):
        return None
    getter = api.get("get_config")
    if not callable(getter):
        return None
    try:
        cfg = getter(reload=True)
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


def _parse_example_key(raw: str, sep: str, default_stage: int, norm_cfg: dict[str, Any]) -> tuple[str, int]:
    s = _norm_text(raw or "", norm_cfg)
    if not s:
        return "", default_stage
    if sep and sep in s:
        left, right = s.rsplit(sep, 1)
        key = _norm_text(left, norm_cfg)
        try:
            stage = int(right.strip())
        except Exception:
            stage = default_stage
        return key, stage
    return s, default_stage


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

    graph_cfg = load_graph_config()
    label_fields = graph_cfg.get("note_type_label_fields") or {}
    linked_fields = graph_cfg.get("note_type_linked_fields") or {}
    tooltip_fields = graph_cfg.get("note_type_tooltip_fields") or {}
    visible_note_types = graph_cfg.get("note_type_visible") or {}
    note_type_colors = graph_cfg.get("note_type_colors") or {}
    layer_colors = graph_cfg.get("layer_colors") or {}
    same_prio_edges = bool(graph_cfg.get("family_same_prio_edges", False))
    same_prio_opacity = float(graph_cfg.get("family_same_prio_opacity", 0.6))
    layer_styles = graph_cfg.get("layer_styles") or {}
    layer_flow = graph_cfg.get("layer_flow") or {}
    layer_flow_speed = float(graph_cfg.get("layer_flow_speed", 0.02))
    family_chain_edges = bool(graph_cfg.get("family_chain_edges", False))
    selected_decks = graph_cfg.get("selected_decks") or []
    reference_auto_opacity = float(graph_cfg.get("reference_auto_opacity", 1.0))
    show_unlinked = bool(graph_cfg.get("show_unlinked", False))
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

    logger.dbg("build_graph start")
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

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
                if k not in n and v is not None:
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
        note_types = fg.get("note_types") or {}
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
                prio_val = min((p for _fid, p in fams), default=default_prio)
                ensure_node(
                    str(nid),
                    label=label,
                    kind="note",
                    note_type_id=str(note.mid),
                    note_type=_note_type_name(col, int(note.mid)),
                    prio=prio_val,
                    extra=_note_extra(note),
                )
                add_layer(str(nid), "family")
                for fid, prio in fams:
                    node = nodes.get(str(nid))
                    if node is not None:
                        fam_list = node.setdefault("families", [])
                        if isinstance(fam_list, list) and fid not in fam_list:
                            fam_list.append(fid)
                    family_groups.setdefault(fid, []).append((nid, prio))

        # build hub edges + direct family edges (limited for performance)
        logger.dbg("family groups", len(family_groups))
        for fid, members in family_groups.items():
            if len(members) < 2 and not show_unlinked:
                continue
            hub_id = f"family:{fid}"
            ensure_node(hub_id, label=fid, kind="family")
            add_layer(hub_id, "family_hub")
            if family_chain_edges:
                by_prio: dict[int, list[int]] = {}
                for nid, prio in members:
                    by_prio.setdefault(prio, []).append(nid)
                prios = sorted(by_prio.keys())
                if prios:
                    lowest = prios[0]
                    for nid in by_prio.get(lowest, []):
                        add_edge(str(nid), hub_id, "family_hub", prio=lowest, fid=fid, kind="hub")
                    for idx in range(1, len(prios)):
                        prev = prios[idx - 1]
                        cur = prios[idx]
                        prev_nodes = by_prio.get(prev, [])
                        if not prev_nodes:
                            continue
                        anchor = prev_nodes[0]
                        for nid in by_prio.get(cur, []):
                            add_edge(str(anchor), str(nid), "family_hub", prio=cur, fid=fid, kind="chain")
            else:
                for nid, prio in members:
                    add_edge(str(nid), hub_id, "family_hub", prio=prio, fid=fid)
            if 1 < len(members) <= MAX_DIRECT_FAMILY_MEMBERS:
                for i in range(len(members)):
                    for j in range(i + 1, len(members)):
                        src, prio = members[i]
                        dst, _prio2 = members[j]
                        if not same_prio_edges and prio == _prio2:
                            continue
                        if prio < _prio2:
                            # flow from higher prio to lower prio
                            add_edge(str(dst), str(src), "family", prio=prio, fid=fid, same_prio=False)
                        elif prio > _prio2:
                            add_edge(str(src), str(dst), "family", prio=_prio2, fid=fid, same_prio=False)
                        else:
                            add_edge(
                                str(src),
                                str(dst),
                                "family",
                                prio=prio,
                                fid=fid,
                                same_prio=True,
                            )
                            add_edge(
                                str(dst),
                                str(src),
                                "family",
                                prio=prio,
                                fid=fid,
                                same_prio=True,
                                flow_only=True,
                            )

    # Example Gate
    eg = cfg.get("example_gate", {})
    if eg.get("enabled"):
        vocab_deck = str(eg.get("vocab_deck") or "")
        example_deck = str(eg.get("example_deck") or "")
        vocab_key_field = str(eg.get("vocab_key_field") or "")
        example_key_field = str(eg.get("example_key_field") or "")
        stage_sep = str(eg.get("stage_sep") or "@")
        default_stage = int(eg.get("default_stage") or 0)
        norm_cfg = eg.get("key_norm") or {}
        family_note_types = set((fg.get("note_types") or {}).keys())

        vocab_index: dict[str, int] = {}
        if vocab_deck and vocab_key_field:
            for nid in _filter_nids(_note_ids_for_deck(col, vocab_deck)):
                try:
                    note = col.get_note(nid)
                except Exception:
                    continue
                if family_note_types and str(note.mid) not in family_note_types:
                    continue
                if vocab_key_field not in note:
                    continue
                key = _norm_text(str(note[vocab_key_field] or ""), norm_cfg)
                if not key or key in vocab_index:
                    continue
                vocab_index[key] = nid
                ensure_node(
                    str(nid),
                    label=_note_label(note, label_fields.get(str(note.mid))),
                    kind="note",
                    note_type_id=str(note.mid),
                    note_type=_note_type_name(col, int(note.mid)),
                    extra=_note_extra(note),
                )
                add_layer(str(nid), "example")

        logger.dbg("example_gate vocab keys", len(vocab_index))
        if example_deck and example_key_field:
            for nid in _filter_nids(_note_ids_for_deck(col, example_deck)):
                try:
                    note = col.get_note(nid)
                except Exception:
                    continue
                if example_key_field not in note:
                    continue
                key, stage = _parse_example_key(
                    str(note[example_key_field] or ""), stage_sep, default_stage, norm_cfg
                )
                if not key:
                    continue
                src = vocab_index.get(key)
                if not src:
                    continue
                ensure_node(
                    str(nid),
                    label=_note_label(note, label_fields.get(str(note.mid))),
                    kind="note",
                    note_type_id=str(note.mid),
                    note_type=_note_type_name(col, int(note.mid)),
                    extra=_note_extra(note),
                )
                add_layer(str(nid), "example")
                add_edge(str(src), str(nid), "example", key=key, stage=stage)

    # Kanji Gate
    kg = cfg.get("kanji_gate", {})
    if kg.get("enabled"):
        kanji_mid = str(kg.get("kanji_note_type") or "")
        kanji_field = str(kg.get("kanji_field") or "")
        kanji_alt_field = str(kg.get("kanji_alt_field") or "")
        components_field = str(kg.get("components_field") or "")
        kanji_rad_field = str(kg.get("kanji_radical_field") or "")
        radical_mid = str(kg.get("radical_note_type") or "")
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
            vocab_cfg = kg.get("vocab_note_types") or {}
            for nt_id, vcfg in vocab_cfg.items():
                if not isinstance(vcfg, dict):
                    continue
                field = str(vcfg.get("furigana_field") or "").strip()
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
            vocab_cfg = kg.get("vocab_note_types") or {}
            for nt_id, vcfg in vocab_cfg.items():
                if not isinstance(vcfg, dict):
                    continue
                field = str(vcfg.get("furigana_field") or "").strip()
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

    # Note Linker (reference)
    nl = cfg.get("note_linker", {})
    if nl.get("enabled"):
        rules = nl.get("rules") or {}
        if isinstance(rules, dict):
            logger.dbg("note_linker rules", len(rules))
            for nt_id, rule in rules.items():
                if not isinstance(rule, dict):
                    continue
                tag = str(rule.get("tag") or "").strip()
                if not tag:
                    continue
                templates = {str(x) for x in (rule.get("templates") or []) if str(x).strip()}
                label_field = str(rule.get("label_field") or "").strip()

                target_nids = _note_ids_for_query(col, f"tag:{tag}")
                if allowed_nids is not None:
                    target_nids = [nid for nid in target_nids if nid in allowed_nids]
                if not target_nids:
                    continue
                target_labels: dict[int, str] = {}
                for tnid in target_nids:
                    try:
                        tnote = col.get_note(tnid)
                    except Exception:
                        continue
                    if label_field and label_field in tnote:
                        target_labels[tnid] = str(tnote[label_field] or "").strip() or _note_label(tnote)
                    else:
                        target_labels[tnid] = _note_label(tnote, label_fields.get(str(tnote.mid)))
                    ensure_node(
                        str(tnid),
                        label=target_labels[tnid],
                        kind="note",
                        note_type_id=str(tnote.mid),
                        note_type=_note_type_name(col, int(tnote.mid)),
                        extra=_note_extra(tnote),
                    )

                for snid in _filter_nids(_note_ids_for_mid(col, str(nt_id))):
                    try:
                        snote = col.get_note(snid)
                    except Exception:
                        continue
                    if templates:
                        try:
                            model = col.models.get(snote.mid)
                            tmpl_names = {
                                str(t.get("name", ""))
                                for t in (model.get("tmpls") or [])
                                if t.get("name")
                            }
                            if not (tmpl_names & templates):
                                continue
                        except Exception:
                            pass
                    ensure_node(
                        str(snid),
                        label=_note_label(snote, label_fields.get(str(snote.mid))),
                        kind="note",
                        note_type_id=str(snote.mid),
                        note_type=_note_type_name(col, int(snote.mid)),
                        extra=_note_extra(snote),
                    )
                    for tnid in target_nids:
                        add_edge(
                            str(snid),
                            str(tnid),
                            "reference",
                            tag=tag,
                            label=target_labels.get(tnid, ""),
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
                        "reference",
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

    # Collapse duplicate reference edges (manual/auto) into a single visible edge.
    # If both directions exist, keep one visible edge and add a flow-only reverse
    # so the flow appears bidirectional on the same line.
    if edges:
        ref_groups: dict[tuple[str, str, bool], dict[str, list[dict[str, Any]]]] = {}
        out_edges: list[dict[str, Any]] = []
        for e in edges:
            if e.get("layer") != "reference":
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
                        "layer": "reference",
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

    if edges:
        for e in edges:
            layer = str(e.get("layer") or "")
            if not layer:
                continue
            add_layer(str(e.get("source")), layer)
            add_layer(str(e.get("target")), layer)

    if edges and not show_unlinked:
        linked_ids = {str(e.get("source")) for e in edges} | {str(e.get("target")) for e in edges}
        nodes = {nid: n for nid, n in nodes.items() if nid in linked_ids}
    note_type_meta: list[dict[str, Any]] = []
    seen_nt: set[str] = set()
    for node in nodes.values():
        mid = node.get("note_type_id")
        if not mid or mid in seen_nt:
            continue
        seen_nt.add(mid)
        try:
            model = col.models.get(int(mid))
        except Exception:
            model = None
        fields = []
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
                "label_field": label_fields.get(str(mid), ""),
                "linked_field": linked_fields.get(str(mid), ""),
                "tooltip_fields": tooltip_fields.get(str(mid), []) if isinstance(tooltip_fields, dict) else [],
                "visible": bool(visible_note_types.get(str(mid), True)),
                "color": note_type_colors.get(str(mid), ""),
            }
        )

    deck_names: list[str] = []
    try:
        deck_names = sorted([d.get("name") for d in (col.decks.all_names_and_ids() or []) if d.get("name")])
    except Exception:
        try:
            deck_names = sorted([str(d) for d in col.decks.all_names() if d])
        except Exception:
            deck_names = []

    logger.dbg("build_graph done", "nodes=", len(nodes), "edges=", len(edges))
    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "meta": {
            "layers": ["family", "family_hub", "reference", "example", "kanji"],
            "note_types": note_type_meta,
            "layer_colors": layer_colors,
            "family_same_prio_edges": same_prio_edges,
            "family_same_prio_opacity": same_prio_opacity,
            "layer_styles": layer_styles,
            "layer_flow": layer_flow,
            "layer_flow_speed": layer_flow_speed,
            "family_chain_edges": family_chain_edges,
            "reference_auto_opacity": reference_auto_opacity,
            "show_unlinked": show_unlinked,
            "selected_decks": selected_decks,
            "decks": deck_names,
            "kanji_components_enabled": kanji_components_enabled,
            "kanji_component_style": kanji_component_style,
            "kanji_component_color": kanji_component_color,
            "kanji_component_opacity": kanji_component_opacity,
            "kanji_component_focus_only": kanji_component_focus_only,
            "kanji_component_flow": kanji_component_flow,
        },
    }
