from __future__ import annotations

import re
import unicodedata

from aqt import mw

from . import logger
from .graph_config import load_graph_config
from .graph_data import (
    _get_family_gate_config,
    _get_tools_config,
    _parse_family_field,
    _parse_link_targets,
)


def _get_family_field() -> str:
    cfg = _get_tools_config()
    family_cfg = _get_family_gate_config(cfg)
    return str(family_cfg.get("family_field") or "")


def _get_family_cfg() -> tuple[str, str, int]:
    cfg = _get_tools_config()
    family_cfg = _get_family_gate_config(cfg)
    field = str(family_cfg.get("family_field") or "")
    sep = str(family_cfg.get("separator") or ";")
    default_prio = int(family_cfg.get("default_prio") or 0)
    return field, sep, default_prio


def _normalize_family_id(value: str) -> str:
    return unicodedata.normalize("NFC", str(value or "").strip())


def _validate_target_family_id(fid: str, sep: str) -> tuple[bool, str]:
    txt = _normalize_family_id(fid)
    if not txt:
        return False, "Family ID is required"
    if "@" in txt:
        return False, "Family ID must not contain '@'"
    sep_txt = str(sep or "")
    if sep_txt and sep_txt in txt:
        return False, f"Family ID must not contain separator '{sep_txt}'"
    return True, ""


def _get_family_note_type_ids() -> set[str]:
    if mw is None or mw.col is None:
        return set()
    cfg = _get_tools_config()
    family_cfg = _get_family_gate_config(cfg, mw.col)
    if not bool(family_cfg.get("enabled")):
        return set()
    note_types = family_cfg.get("note_types") or {}
    if not isinstance(note_types, dict):
        return set()
    return {str(k).strip() for k in note_types.keys() if str(k).strip()}


def _iter_family_gate_note_ids(field: str, note_type_ids: set[str]) -> list[int]:
    if mw is None or mw.col is None:
        return []
    if not field:
        return []
    if not note_type_ids:
        return []

    out: list[int] = []
    seen: set[int] = set()
    for nt_id in sorted(note_type_ids):
        try:
            mid = int(str(nt_id))
        except Exception:
            continue
        try:
            nids = mw.col.db.list("select id from notes where mid = ?", mid)
        except Exception:
            nids = []
        for raw in nids:
            try:
                nid = int(raw)
            except Exception:
                continue
            if nid <= 0 or nid in seen:
                continue
            seen.add(nid)
            out.append(nid)
    return out


def _family_joiner_from_raw(raw: str, sep: str) -> str:
    joiner = str(sep or ";")
    if sep and (sep + " ") in str(raw or ""):
        joiner = sep + " "
    elif sep == ";":
        joiner = "; "
    return joiner


def _serialize_family_entries(entries: list[tuple[str, int]], joiner: str, default_prio: int) -> str:
    parts: list[str] = []
    for fid, prio in entries:
        if int(prio) == int(default_prio):
            parts.append(str(fid))
        else:
            parts.append(f"{fid}@{int(prio)}")
    return str(joiner).join(parts).strip()


def _rename_family_entries_for_note(
    fams: list[tuple[str, int]],
    old_fid: str,
    new_fid: str,
) -> tuple[list[tuple[str, int]], bool, bool]:
    old_norm = _normalize_family_id(old_fid)
    new_norm = _normalize_family_id(new_fid)
    if not fams or not old_norm or not new_norm:
        return fams, False, False

    has_old = any(_normalize_family_id(fid) == old_norm for fid, _ in fams)
    if not has_old:
        return fams, False, False

    has_new = any(_normalize_family_id(fid) == new_norm for fid, _ in fams)
    target_prio: int | None = None
    for fid_raw, prio_raw in fams:
        fid_norm = _normalize_family_id(fid_raw)
        if fid_norm != old_norm and fid_norm != new_norm:
            continue
        p = int(prio_raw)
        if target_prio is None or p < target_prio:
            target_prio = p
    if target_prio is None:
        target_prio = 0

    out: list[tuple[str, int]] = []
    target_added = False
    for fid_raw, prio_raw in fams:
        fid_norm = _normalize_family_id(fid_raw)
        if fid_norm == old_norm or fid_norm == new_norm:
            if not target_added:
                out.append((new_norm, int(target_prio)))
                target_added = True
            continue
        out.append((str(fid_raw), int(prio_raw)))
    return out, True, bool(has_new)


def _preview_family_id_rename(
    old_fid: str,
    new_fid: str,
    field: str,
    sep: str,
    default_prio: int,
    note_type_ids: set[str],
) -> dict:
    old_norm = _normalize_family_id(old_fid)
    new_norm = _normalize_family_id(new_fid)
    stats = {
        "ok": True,
        "old_fid": old_norm,
        "new_fid": new_norm,
        "affected_notes": 0,
        "scanned_notes": 0,
        "collisions": 0,
        "changed_notes": 0,
        "error": "",
    }
    if mw is None or mw.col is None:
        stats["ok"] = False
        stats["error"] = "Collection unavailable"
        return stats
    if not field:
        stats["ok"] = False
        stats["error"] = "Family field is not configured"
        return stats
    if not note_type_ids:
        stats["ok"] = False
        stats["error"] = "Family note types are not configured"
        return stats

    nids = _iter_family_gate_note_ids(field, note_type_ids)
    for nid in nids:
        stats["scanned_notes"] += 1
        try:
            note = mw.col.get_note(nid)
        except Exception:
            continue
        if note is None or field not in note:
            continue
        raw = str(note[field] or "")
        fams = _parse_family_field(raw, sep, default_prio)
        renamed, changed, collision = _rename_family_entries_for_note(fams, old_norm, new_norm)
        if not changed:
            continue
        if collision:
            stats["collisions"] += 1
        joiner = _family_joiner_from_raw(raw, sep)
        new_raw = _serialize_family_entries(renamed, joiner, default_prio)
        if new_raw != raw.strip():
            stats["affected_notes"] += 1

    logger.dbg(
        "family id rename preview",
        "old=",
        old_norm,
        "new=",
        new_norm,
        "scanned=",
        stats["scanned_notes"],
        "affected=",
        stats["affected_notes"],
        "collisions=",
        stats["collisions"],
    )
    return stats


def _apply_family_id_rename_global(
    old_fid: str,
    new_fid: str,
    field: str,
    sep: str,
    default_prio: int,
    note_type_ids: set[str],
) -> dict:
    old_norm = _normalize_family_id(old_fid)
    new_norm = _normalize_family_id(new_fid)
    stats = {
        "ok": True,
        "old_fid": old_norm,
        "new_fid": new_norm,
        "affected_notes": 0,
        "scanned_notes": 0,
        "collisions": 0,
        "changed_notes": 0,
        "error": "",
        "changed_nids": [],
    }
    if mw is None or mw.col is None:
        stats["ok"] = False
        stats["error"] = "Collection unavailable"
        return stats
    if not field:
        stats["ok"] = False
        stats["error"] = "Family field is not configured"
        return stats
    if not note_type_ids:
        stats["ok"] = False
        stats["error"] = "Family note types are not configured"
        return stats

    changed_nids: list[int] = []
    nids = _iter_family_gate_note_ids(field, note_type_ids)
    for nid in nids:
        stats["scanned_notes"] += 1
        try:
            note = mw.col.get_note(nid)
        except Exception:
            continue
        if note is None or field not in note:
            continue
        raw = str(note[field] or "")
        fams = _parse_family_field(raw, sep, default_prio)
        renamed, changed, collision = _rename_family_entries_for_note(fams, old_norm, new_norm)
        if not changed:
            continue
        if collision:
            stats["collisions"] += 1
        joiner = _family_joiner_from_raw(raw, sep)
        new_raw = _serialize_family_entries(renamed, joiner, default_prio)
        if new_raw == raw.strip():
            continue
        note[field] = new_raw
        try:
            note.flush()
        except Exception:
            try:
                mw.col.update_note(note)
            except Exception:
                continue
        stats["affected_notes"] += 1
        changed_nids.append(int(nid))

    stats["changed_notes"] = len(changed_nids)
    stats["changed_nids"] = changed_nids
    logger.info(
        "family id rename apply",
        "old=",
        old_norm,
        "new=",
        new_norm,
        "scanned=",
        stats["scanned_notes"],
        "affected=",
        stats["affected_notes"],
        "collisions=",
        stats["collisions"],
        "changed=",
        stats["changed_notes"],
    )
    return stats

def _append_family_to_note(
    nid: int, fid: str, prio: int, field: str, sep: str, default_prio: int
) -> bool:
    if mw is None or mw.col is None:
        return False
    if not field:
        return False
    try:
        note = mw.col.get_note(nid)
    except Exception:
        return False
    if note is None or field not in note:
        return False
    raw = str(note[field] or "")
    fams = _parse_family_field(raw, sep, default_prio)
    for existing_fid, _p in fams:
        if existing_fid == fid:
            return False
    entry = f"{fid}@{prio}"
    if not raw.strip():
        new_val = entry
    else:
        joiner = sep
        if sep and (sep + " ") in raw:
            joiner = sep + " "
        elif sep == ";":
            joiner = "; "
        new_val = raw.rstrip() + joiner + entry
    note[field] = new_val
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True


def _remove_family_from_note(nid: int, fid: str, field: str, sep: str, default_prio: int) -> bool:
    if mw is None or mw.col is None:
        return False
    if not field:
        return False
    try:
        note = mw.col.get_note(nid)
    except Exception:
        return False
    if note is None or field not in note:
        return False
    raw = str(note[field] or "")
    fams = _parse_family_field(raw, sep, default_prio)
    if not fams:
        return False
    kept: list[tuple[str, int]] = [(f, p) for f, p in fams if f != fid]
    if len(kept) == len(fams):
        return False
    joiner = sep
    if sep and (sep + " ") in raw:
        joiner = sep + " "
    elif sep == ";":
        joiner = "; "
    parts: list[str] = []
    for f, p in kept:
        if p == default_prio:
            parts.append(f)
        else:
            parts.append(f"{f}@{p}")
    note[field] = joiner.join(parts).strip()
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True


def _append_link_to_note(nid: int, source_nid: int, label: str) -> bool:
    if mw is None or mw.col is None:
        return False
    try:
        note = mw.col.get_note(nid)
    except Exception:
        return False
    if note is None:
        return False
    cfg = load_graph_config()
    linked_fields = cfg.get("note_type_linked_fields") or {}
    field = str(linked_fields.get(str(note.mid)) or "").strip()
    if not field or field not in note:
        return False
    raw = str(note[field] or "")
    existing, _invalid = _parse_link_targets(raw)
    for _lbl, nid_val in existing:
        if nid_val == source_nid:
            return False
    safe_label = (label or "").strip() or f"Note {source_nid}"
    safe_label = safe_label.replace("[", "").replace("]", "")
    tag = f"[{safe_label}|nid{source_nid}]"
    if raw.strip():
        new_val = raw.rstrip() + " " + tag
    else:
        new_val = tag
    note[field] = new_val
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True


_LINK_TAG_RE = re.compile(r"\[([^\]|]+)\|\s*([^\]]+?)\s*\]")


def _token_to_nid(token: str) -> int | None:
    token = (token or "").strip()
    if not token:
        return None
    m = re.search(r"(?:nid|noteid|note|cid|card|cardid)?\s*(\d+)", token, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    if token.isdigit():
        try:
            return int(token)
        except Exception:
            return None
    return None


def _remove_link_from_note(nid: int, target_nid: int) -> bool:
    if mw is None or mw.col is None:
        return False
    try:
        note = mw.col.get_note(nid)
    except Exception:
        return False
    if note is None:
        return False
    cfg = load_graph_config()
    linked_fields = cfg.get("note_type_linked_fields") or {}
    field = str(linked_fields.get(str(note.mid)) or "").strip()
    if not field or field not in note:
        return False
    raw = str(note[field] or "")
    if not raw:
        return False
    removed = False

    def _repl(match: re.Match) -> str:
        nonlocal removed
        token = match.group(2) or ""
        nid_val = _token_to_nid(token)
        if nid_val == target_nid:
            removed = True
            return ""
        return match.group(0)

    new_val = _LINK_TAG_RE.sub(_repl, raw)
    if not removed:
        return False
    new_val = re.sub(r"\s{2,}", " ", new_val).strip()
    note[field] = new_val
    try:
        note.flush()
    except Exception:
        try:
            mw.col.update_note(note)
        except Exception:
            return False
    return True
