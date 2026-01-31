from __future__ import annotations

import json
import os
from typing import Any

ADDON_DIR = os.path.dirname(__file__)
CONFIG_PATH = os.path.join(ADDON_DIR, "graph_config.json")

DEFAULT_CFG: dict[str, Any] = {
    "note_type_label_fields": {},
    "note_type_linked_fields": {},
    "note_type_tooltip_fields": {},
    "note_type_visible": {},
    "note_type_colors": {},
    "layer_colors": {},
    "family_same_prio_edges": False,
    "family_same_prio_opacity": 0.6,
    "layer_styles": {},
    "layer_flow": {},
    "layer_flow_speed": 0.02,
    "family_chain_edges": False,
    "selected_decks": [],
    "reference_auto_opacity": 1.0,
}


def _normalize(cfg: dict[str, Any]) -> dict[str, Any]:
    for key in (
        "note_type_label_fields",
        "note_type_linked_fields",
        "note_type_tooltip_fields",
        "note_type_visible",
        "note_type_colors",
        "layer_colors",
        "layer_styles",
        "layer_flow",
    ):
        if key not in cfg or not isinstance(cfg.get(key), dict):
            cfg[key] = {}
    if not isinstance(cfg.get("family_same_prio_edges"), bool):
        cfg["family_same_prio_edges"] = False
    if not isinstance(cfg.get("family_same_prio_opacity"), (int, float)):
        cfg["family_same_prio_opacity"] = 0.6
    if not isinstance(cfg.get("family_chain_edges"), bool):
        cfg["family_chain_edges"] = False
    if not isinstance(cfg.get("layer_flow_speed"), (int, float)):
        cfg["layer_flow_speed"] = 0.02
    if not isinstance(cfg.get("selected_decks"), list):
        cfg["selected_decks"] = []
    if not isinstance(cfg.get("reference_auto_opacity"), (int, float)):
        cfg["reference_auto_opacity"] = 1.0
    return cfg


def load_graph_config() -> dict[str, Any]:
    if not os.path.exists(CONFIG_PATH):
        return DEFAULT_CFG.copy()
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return DEFAULT_CFG.copy()
        return _normalize(data)
    except Exception:
        return DEFAULT_CFG.copy()


def save_graph_config(cfg: dict[str, Any]) -> None:
    try:
        _normalize(cfg)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def set_note_type_visible(mid: str, visible: bool) -> None:
    cfg = load_graph_config()
    cfg["note_type_visible"][str(mid)] = bool(visible)
    save_graph_config(cfg)


def set_note_type_label_field(mid: str, field: str) -> None:
    cfg = load_graph_config()
    mid = str(mid)
    field = (field or "").strip()
    if not field or field.lower() == "auto":
        cfg["note_type_label_fields"].pop(mid, None)
    else:
        cfg["note_type_label_fields"][mid] = field
    save_graph_config(cfg)


def set_note_type_linked_field(mid: str, field: str) -> None:
    cfg = load_graph_config()
    mid = str(mid)
    field = (field or "").strip()
    if not field or field.lower() == "none":
        cfg["note_type_linked_fields"].pop(mid, None)
    else:
        cfg["note_type_linked_fields"][mid] = field
    save_graph_config(cfg)


def set_note_type_tooltip_fields(mid: str, fields: list[str]) -> None:
    cfg = load_graph_config()
    mid = str(mid)
    cleaned = []
    for f in fields or []:
        f = (f or "").strip()
        if f:
            cleaned.append(f)
    if not cleaned:
        cfg["note_type_tooltip_fields"].pop(mid, None)
    else:
        cfg["note_type_tooltip_fields"][mid] = cleaned
    save_graph_config(cfg)


def set_note_type_color(mid: str, color: str) -> None:
    cfg = load_graph_config()
    mid = str(mid)
    color = (color or "").strip()
    if not color or color.lower() == "auto":
        cfg["note_type_colors"].pop(mid, None)
    else:
        cfg["note_type_colors"][mid] = color
    save_graph_config(cfg)


def set_layer_color(layer: str, color: str) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    color = (color or "").strip()
    if not layer:
        return
    if not color or color.lower() == "auto":
        cfg["layer_colors"].pop(layer, None)
    else:
        cfg["layer_colors"][layer] = color
    save_graph_config(cfg)


def set_family_same_prio_edges(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["family_same_prio_edges"] = bool(enabled)
    save_graph_config(cfg)


def set_family_same_prio_opacity(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["family_same_prio_opacity"] = float(value)
    except Exception:
        return
    save_graph_config(cfg)


def set_layer_style(layer: str, style: str) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    style = (style or "").strip().lower()
    if not layer:
        return
    if style in ("", "auto"):
        cfg["layer_styles"].pop(layer, None)
    else:
        cfg["layer_styles"][layer] = style
    save_graph_config(cfg)


def set_layer_flow(layer: str, enabled: bool) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    if not layer:
        return
    cfg["layer_flow"][layer] = bool(enabled)
    save_graph_config(cfg)


def set_layer_flow_speed(speed: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["layer_flow_speed"] = float(speed)
    except Exception:
        return
    save_graph_config(cfg)


def set_family_chain_edges(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["family_chain_edges"] = bool(enabled)
    save_graph_config(cfg)


def set_selected_decks(decks: list[str]) -> None:
    cfg = load_graph_config()
    cleaned = []
    for name in decks or []:
        name = (name or "").strip()
        if name:
            cleaned.append(name)
    cfg["selected_decks"] = cleaned
    save_graph_config(cfg)


def set_reference_auto_opacity(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["reference_auto_opacity"] = float(value)
    except Exception:
        return
    save_graph_config(cfg)
