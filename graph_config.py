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
    "note_type_hubs": {},
    "layer_enabled": {},
    "layer_colors": {"family": "#3d95e7", "family_hub": "#34d399"},
    "family_same_prio_edges": False,
    "family_same_prio_opacity": 0.15,
    "layer_styles": {
        "family_hub": "pointed",
        "family": "solid",
        "reference": "dashed",
        "kanji": "solid",
    },
    "layer_flow": {
        "family": True,
        "family_hub": False,
        "reference": True,
        "kanji": True,
        "example": True,
    },
    "link_strengths": {
        "family": 1.0,
        "family_hub": 1.0,
        "reference": 1.0,
        "example": 1.0,
        "kanji": 1.0,
        "kanji_component": 1.0,
    },
    "physics": {
        "charge": -80,
        "link_distance": 30,
        "link_strength": 1,
        "velocity_decay": 0.35,
        "alpha_decay": 0.02,
        "cooldown_ticks": 80,
        "warmup_ticks": 180,
        "max_radius": 1400,
    },
    "soft_pin_radius": 140,
    "layer_flow_speed": 0.35,
    "family_chain_edges": True,
    "selected_decks": [],
    "reference_auto_opacity": 0.15,
    "show_unlinked": True,
    "kanji_hubs": False,
    "kanji_components_enabled": True,
    "kanji_component_style": "solid",
    "kanji_component_color": "#f8ba87",
    "kanji_component_opacity": 0.5,
    "kanji_component_focus_only": True,
    "kanji_component_flow": True,
    "card_dot_suspended_color": "#ef4444",
    "card_dot_buried_color": "#f59e0b",
    "card_dots_enabled": True,
}


def _normalize(cfg: dict[str, Any]) -> dict[str, Any]:
    for key in (
        "note_type_label_fields",
        "note_type_linked_fields",
        "note_type_tooltip_fields",
        "note_type_visible",
        "note_type_colors",
        "note_type_hubs",
        "layer_enabled",
        "layer_colors",
        "layer_styles",
        "layer_flow",
        "link_strengths",
    ):
        if key not in cfg or not isinstance(cfg.get(key), dict):
            cfg[key] = DEFAULT_CFG.get(key, {}).copy()
    if "physics" not in cfg or not isinstance(cfg.get("physics"), dict):
        cfg["physics"] = DEFAULT_CFG.get("physics", {}).copy()
    else:
        for pkey, pval in DEFAULT_CFG.get("physics", {}).items():
            cur = cfg["physics"].get(pkey)
            if not isinstance(cur, (int, float)):
                cfg["physics"][pkey] = pval
    if not isinstance(cfg.get("family_same_prio_edges"), bool):
        cfg["family_same_prio_edges"] = False
    if not isinstance(cfg.get("family_same_prio_opacity"), (int, float)):
        cfg["family_same_prio_opacity"] = DEFAULT_CFG["family_same_prio_opacity"]
    if not isinstance(cfg.get("family_chain_edges"), bool):
        cfg["family_chain_edges"] = DEFAULT_CFG["family_chain_edges"]
    if not isinstance(cfg.get("layer_flow_speed"), (int, float)):
        cfg["layer_flow_speed"] = DEFAULT_CFG["layer_flow_speed"]
    if not isinstance(cfg.get("soft_pin_radius"), (int, float)):
        cfg["soft_pin_radius"] = DEFAULT_CFG["soft_pin_radius"]
    if not isinstance(cfg.get("selected_decks"), list):
        cfg["selected_decks"] = []
    if not isinstance(cfg.get("reference_auto_opacity"), (int, float)):
        cfg["reference_auto_opacity"] = DEFAULT_CFG["reference_auto_opacity"]
    if not isinstance(cfg.get("show_unlinked"), bool):
        cfg["show_unlinked"] = DEFAULT_CFG["show_unlinked"]
    if not isinstance(cfg.get("kanji_hubs"), bool):
        cfg["kanji_hubs"] = False
    if not isinstance(cfg.get("kanji_components_enabled"), bool):
        cfg["kanji_components_enabled"] = True
    if not isinstance(cfg.get("kanji_component_style"), str):
        cfg["kanji_component_style"] = DEFAULT_CFG["kanji_component_style"]
    if not isinstance(cfg.get("kanji_component_color"), str):
        cfg["kanji_component_color"] = DEFAULT_CFG["kanji_component_color"]
    if not isinstance(cfg.get("kanji_component_opacity"), (int, float)):
        cfg["kanji_component_opacity"] = DEFAULT_CFG["kanji_component_opacity"]
    if not isinstance(cfg.get("kanji_component_focus_only"), bool):
        cfg["kanji_component_focus_only"] = DEFAULT_CFG["kanji_component_focus_only"]
    if not isinstance(cfg.get("kanji_component_flow"), bool):
        cfg["kanji_component_flow"] = DEFAULT_CFG["kanji_component_flow"]
    if not isinstance(cfg.get("card_dot_suspended_color"), str):
        cfg["card_dot_suspended_color"] = DEFAULT_CFG["card_dot_suspended_color"]
    if not isinstance(cfg.get("card_dot_buried_color"), str):
        cfg["card_dot_buried_color"] = DEFAULT_CFG["card_dot_buried_color"]
    if not isinstance(cfg.get("card_dots_enabled"), bool):
        cfg["card_dots_enabled"] = DEFAULT_CFG["card_dots_enabled"]
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


def set_note_type_hub(mid: str, enabled: bool) -> None:
    cfg = load_graph_config()
    mid = str(mid)
    cfg.setdefault("note_type_hubs", {})
    if enabled:
        cfg["note_type_hubs"][mid] = True
    else:
        cfg["note_type_hubs"].pop(mid, None)
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


def set_layer_enabled(layer: str, enabled: bool) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    if not layer:
        return
    cfg.setdefault("layer_enabled", {})
    cfg["layer_enabled"][layer] = bool(enabled)
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


def set_physics_value(key: str, value: float) -> None:
    cfg = load_graph_config()
    key = (key or "").strip()
    if not key:
        return
    if "physics" not in cfg or not isinstance(cfg.get("physics"), dict):
        cfg["physics"] = DEFAULT_CFG.get("physics", {}).copy()
    if key not in DEFAULT_CFG.get("physics", {}):
        return
    try:
        cfg["physics"][key] = float(value)
    except Exception:
        return
    save_graph_config(cfg)


def set_soft_pin_radius(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["soft_pin_radius"] = float(value)
    except Exception:
        return
    save_graph_config(cfg)


def set_link_strength(layer: str, strength: float) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    if not layer:
        return
    try:
        value = float(strength)
    except Exception:
        return
    cfg.setdefault("link_strengths", {})
    cfg["link_strengths"][layer] = value
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


def set_show_unlinked(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["show_unlinked"] = bool(enabled)
    save_graph_config(cfg)


def set_kanji_components_enabled(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["kanji_components_enabled"] = bool(enabled)
    save_graph_config(cfg)


def set_kanji_component_style(style: str) -> None:
    cfg = load_graph_config()
    style = (style or "").strip().lower()
    if style in ("", "auto"):
        cfg["kanji_component_style"] = "solid"
    else:
        cfg["kanji_component_style"] = style
    save_graph_config(cfg)


def set_kanji_component_color(color: str) -> None:
    cfg = load_graph_config()
    color = (color or "").strip()
    cfg["kanji_component_color"] = color
    save_graph_config(cfg)


def set_kanji_component_opacity(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["kanji_component_opacity"] = float(value)
    except Exception:
        return
    save_graph_config(cfg)


def set_kanji_component_focus_only(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["kanji_component_focus_only"] = bool(enabled)
    save_graph_config(cfg)


def set_kanji_component_flow(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["kanji_component_flow"] = bool(enabled)
    save_graph_config(cfg)


def set_card_dot_suspended_color(color: str) -> None:
    cfg = load_graph_config()
    color = (color or "").strip()
    if not color:
        color = DEFAULT_CFG["card_dot_suspended_color"]
    cfg["card_dot_suspended_color"] = color
    save_graph_config(cfg)


def set_card_dot_buried_color(color: str) -> None:
    cfg = load_graph_config()
    color = (color or "").strip()
    if not color:
        color = DEFAULT_CFG["card_dot_buried_color"]
    cfg["card_dot_buried_color"] = color
    save_graph_config(cfg)


def set_card_dots_enabled(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["card_dots_enabled"] = bool(enabled)
    save_graph_config(cfg)
