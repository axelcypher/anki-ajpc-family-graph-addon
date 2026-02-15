from __future__ import annotations

import re

from aqt import mw

from .graph_config import load_graph_config
from .graph_data import _get_tools_config, _parse_family_field, _parse_link_targets


def _get_family_field() -> str:
    cfg = _get_tools_config()
    if not isinstance(cfg, dict):
        return ""
    fg = cfg.get("family_gate", {}) or {}
    return str(fg.get("family_field") or "")


def _get_family_cfg() -> tuple[str, str, int]:
    cfg = _get_tools_config()
    if not isinstance(cfg, dict):
        return "", ";", 0
    fg = cfg.get("family_gate", {}) or {}
    field = str(fg.get("family_field") or "")
    sep = str(fg.get("separator") or ";")
    try:
        default_prio = int(fg.get("default_prio") or 0)
    except Exception:
        default_prio = 0
    return field, sep, default_prio

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
