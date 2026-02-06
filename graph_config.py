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
        "family_hub": "dotted",
        "family": "solid",
        "reference": "dashed",
        "mass_linker": "dashed",
        "kanji": "solid",
    },
    "layer_flow": {
        "family": True,
        "family_hub": False,
        "reference": True,
        "mass_linker": True,
        "kanji": True,
        "example": True,
    },
    "link_strengths": {
        "family": 1.0,
        "family_hub": 1.0,
        "reference": 1.0,
        "mass_linker": 1.0,
        "example": 1.0,
        "kanji": 1.0,
        "kanji_component": 1.0,
    },
    "link_distances": {},
    "physics": {
        "charge": -80,
        "link_distance": 30,
        "link_strength": 1,
        "velocity_decay": 0.35,
        "alpha_decay": 0.02,
        "center_force": 0.0,
        "cooldown_ticks": 80,
        "cooldown_time": 15000,
        "warmup_ticks": 180,
        "max_radius": 1400,
    },
    "neighbor_scaling": {
        "mode": "none",
        "directed": "undirected",
        "weights": {
            "family": 1.4,
            "family_hub": 0.7,
            "reference": 0.9,
            "mass_linker": 0.4,
            "example": 1.0,
            "kanji": 0.2,
            "kanji_component": 0.0,
        },
    },
    "link_mst_enabled": False,
    "hub_damping": False,
    "reference_damping": False,
    "kanji_tfidf_enabled": False,
    "kanji_top_k_enabled": False,
    "kanji_top_k": 10,
    "kanji_quantile_norm": False,
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
        "link_distances",
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
    if not isinstance(cfg.get("neighbor_scaling"), dict):
        cfg["neighbor_scaling"] = DEFAULT_CFG.get("neighbor_scaling", {}).copy()
    nscale = cfg.get("neighbor_scaling") or {}
    mode = nscale.get("mode")
    if not isinstance(mode, str) or mode not in ("none", "ccm", "twohop", "jaccard", "overlap"):
        mode = DEFAULT_CFG["neighbor_scaling"]["mode"]
    directed = nscale.get("directed")
    if not isinstance(directed, str) or directed not in ("undirected", "out", "in"):
        directed = DEFAULT_CFG["neighbor_scaling"]["directed"]
    weights_in = nscale.get("weights")
    if not isinstance(weights_in, dict):
        weights_in = {}
    defaults = DEFAULT_CFG["neighbor_scaling"]["weights"]
    weights: dict[str, float] = {}
    for key, default in defaults.items():
        val = weights_in.get(key)
        if isinstance(val, (int, float)):
            weights[key] = float(val)
        else:
            weights[key] = float(default)
    cfg["neighbor_scaling"] = {"mode": mode, "directed": directed, "weights": weights}
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
    if not isinstance(cfg.get("link_mst_enabled"), bool):
        cfg["link_mst_enabled"] = DEFAULT_CFG["link_mst_enabled"]
    if not isinstance(cfg.get("hub_damping"), bool):
        cfg["hub_damping"] = DEFAULT_CFG["hub_damping"]
    if not isinstance(cfg.get("reference_damping"), bool):
        cfg["reference_damping"] = DEFAULT_CFG["reference_damping"]
    if not isinstance(cfg.get("kanji_tfidf_enabled"), bool):
        cfg["kanji_tfidf_enabled"] = DEFAULT_CFG["kanji_tfidf_enabled"]
    if not isinstance(cfg.get("kanji_top_k_enabled"), bool):
        cfg["kanji_top_k_enabled"] = DEFAULT_CFG["kanji_top_k_enabled"]
    if not isinstance(cfg.get("kanji_top_k"), (int, float)):
        cfg["kanji_top_k"] = DEFAULT_CFG["kanji_top_k"]
    if not isinstance(cfg.get("kanji_quantile_norm"), bool):
        cfg["kanji_quantile_norm"] = DEFAULT_CFG["kanji_quantile_norm"]
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


def set_neighbor_scaling(cfg_in: dict[str, Any]) -> None:
    cfg = load_graph_config()
    nscale = cfg.get("neighbor_scaling") or {}
    mode = cfg_in.get("mode")
    if isinstance(mode, str) and mode in ("none", "ccm", "twohop", "jaccard", "overlap"):
        nscale["mode"] = mode
    directed = cfg_in.get("directed")
    if isinstance(directed, str) and directed in ("undirected", "out", "in"):
        nscale["directed"] = directed
    weights_in = cfg_in.get("weights")
    if isinstance(weights_in, dict):
        cleaned: dict[str, float] = {}
        defaults = DEFAULT_CFG["neighbor_scaling"]["weights"]
        for k, v in weights_in.items():
            if not isinstance(k, str):
                continue
            if isinstance(v, (int, float)):
                cleaned[k] = float(v)
        if cleaned:
            # merge with defaults so all keys exist
            merged = {**defaults, **cleaned}
            nscale["weights"] = merged
    cfg["neighbor_scaling"] = nscale
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


def set_link_distance(layer: str, distance: float) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    if not layer:
        return
    try:
        value = float(distance)
    except Exception:
        return
    cfg.setdefault("link_distances", {})
    cfg["link_distances"][layer] = value
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


def set_reference_damping(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["reference_damping"] = bool(enabled)
    save_graph_config(cfg)


def set_link_mst_enabled(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["link_mst_enabled"] = bool(enabled)
    save_graph_config(cfg)


def set_hub_damping(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["hub_damping"] = bool(enabled)
    save_graph_config(cfg)


def set_kanji_tfidf_enabled(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["kanji_tfidf_enabled"] = bool(enabled)
    save_graph_config(cfg)


def set_kanji_top_k_enabled(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["kanji_top_k_enabled"] = bool(enabled)
    save_graph_config(cfg)


def set_kanji_top_k(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["kanji_top_k"] = int(value)
    except Exception:
        cfg["kanji_top_k"] = DEFAULT_CFG["kanji_top_k"]
    save_graph_config(cfg)


def set_kanji_quantile_norm(enabled: bool) -> None:
    cfg = load_graph_config()
    cfg["kanji_quantile_norm"] = bool(enabled)
    save_graph_config(cfg)
