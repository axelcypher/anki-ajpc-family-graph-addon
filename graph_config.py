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
    "mass_linker_group_hubs": [],
    "layer_enabled": {},
    "layer_colors": {
        "notes": "#3d95e7",
        "priority": "#6ee7b7",
        "families": "#34d399",
        "note_links": "#f59e0b",
        "examples": "#60a5fa",
        "kanji": "#f87171",
    },
    "link_colors": {
        "notes": "#3d95e7",
        "priority": "#6ee7b7",
        "families": "#34d399",
        "note_links": "#f59e0b",
        "examples": "#60a5fa",
        "kanji": "#f87171",
    },
    "family_same_prio_edges": False,
    "family_same_prio_opacity": 0.15,
    "layer_styles": {
        "priority": "solid",
        "families": "dotted",
        "note_links": "dashed",
        "kanji": "solid",
    },
    "layer_flow": {
        "priority": True,
        "families": False,
        "note_links": True,
        "kanji": True,
        "examples": True,
    },
    "link_strengths": {
        "priority": 1.0,
        "families": 1.0,
        "note_links": 1.0,
        "examples": 1.0,
        "kanji": 1.0,
        "kanji_component": 1.0,
    },
    "link_weights": {},
    "link_weight_modes": {},
    "link_distances": {},
    "solver": {
        "layout_enabled": True,
        "d3_alpha": 1.0,
        "d3_alpha_min": 0.001,
        "d3_alpha_decay": 0.03,
        "d3_alpha_target": 0.0,
        "d3_velocity_decay": 0.35,
        "d3_center_x": 0.0,
        "d3_center_y": 0.0,
        "d3_center_strength": 0.02,
        "d3_manybody_strength": -90.0,
        "d3_manybody_theta": 0.9,
        "d3_manybody_distance_min": 1.0,
        "d3_manybody_distance_max": 0.0,
        "d3_link_distance": 30.0,
        "d3_link_strength": 0.08,
        "d3_link_iterations": 1.0,
        "d3_warmup_ticks": 0.0,
        "d3_cooldown_ticks": 0.0,
        "d3_cooldown_time_ms": 0.0,
    },
    "engine": {},
    "renderer": {
        "sigma_draw_labels": True,
        "sigma_draw_hover_nodes": False,
        "sigma_note_node_aa": True,
        "sigma_label_threshold": 8.0,
        "sigma_label_zoom_min": 1.0,
        "sigma_hide_edges_on_move": False,
        "sigma_batch_edges_drawing": True,
        "sigma_mouse_wheel_enabled": True,
        "sigma_double_click_enabled": False,
        "sigma_min_camera_ratio": 0.01,
        "sigma_max_camera_ratio": 6.0,
        "sigma_side_margin": 0.0,
        "sigma_animations_time": 180.0,
        "sigma_enable_edge_hovering": False,
    },
    "node": {
        "node_degree_size_factor": 0.18,
    },
    "neighbor_scaling": {
        "mode": "none",
        "directed": "undirected",
        "weights": {
            "priority": 1.4,
            "families": 0.7,
            "note_links": 0.9,
            "examples": 1.0,
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
    "layer_flow_spacing_mul": 18.0,
    "layer_flow_radius_mul": 3.6,
    "trailing_hub_distance": 18.0,
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

_SOLVER_BOOL_KEYS = {
    "layout_enabled",
}

_ENGINE_BOOL_KEYS: set[str] = set()

_RENDERER_BOOL_KEYS = {
    "sigma_draw_labels",
    "sigma_draw_hover_nodes",
    "sigma_note_node_aa",
    "sigma_hide_edges_on_move",
    "sigma_batch_edges_drawing",
    "sigma_mouse_wheel_enabled",
    "sigma_double_click_enabled",
    "sigma_enable_edge_hovering",
}

_NODE_BOOL_KEYS: set[str] = set()

_LAYER_MIGRATE = {
    "family": "priority",
    "family_hub": "families",
    "reference": "note_links",
    "example": "examples",
    "mass_linker": "provider_mass_linker",
}


def _migrate_layer_map(
    src: dict[str, Any],
    *,
    copy_family_to_priority: bool = True,
    copy_family_to_notes: bool = False,
) -> dict[str, Any]:
    out = dict(src or {})
    for old_key, new_key in _LAYER_MIGRATE.items():
        if old_key in src and new_key not in out:
            out[new_key] = src[old_key]
    if copy_family_to_priority and "family" in src and "priority" not in out:
        out["priority"] = src["family"]
    if copy_family_to_notes and "family" in src and "notes" not in out:
        out["notes"] = src["family"]
    return out


def _parse_bool_like(value: Any, fallback: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        raw = value.strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return True
        if raw in ("0", "false", "no", "off"):
            return False
    return fallback


def _merge_section_defaults(section: Any, defaults: dict[str, Any]) -> dict[str, Any]:
    src = section if isinstance(section, dict) else {}
    out = dict(defaults)
    for key in defaults.keys():
        if key not in src:
            continue
        out[key] = src.get(key)
    return out


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
        "link_colors",
        "layer_styles",
        "layer_flow",
        "link_strengths",
        "link_weights",
        "link_weight_modes",
        "link_distances",
    ):
        if key not in cfg or not isinstance(cfg.get(key), dict):
            cfg[key] = DEFAULT_CFG.get(key, {}).copy()
    if not isinstance(cfg.get("mass_linker_group_hubs"), list):
        cfg["mass_linker_group_hubs"] = list(DEFAULT_CFG.get("mass_linker_group_hubs", []))
    else:
        cleaned_hubs: list[str] = []
        seen_hubs: set[str] = set()
        for raw in cfg.get("mass_linker_group_hubs") or []:
            grp = str(raw or "").strip()
            if not grp:
                continue
            key = grp.lower()
            if key in seen_hubs:
                continue
            seen_hubs.add(key)
            cleaned_hubs.append(grp)
        cfg["mass_linker_group_hubs"] = cleaned_hubs
    cfg["layer_colors"] = _migrate_layer_map(cfg.get("layer_colors", {}), copy_family_to_notes=True)
    cfg["link_colors"] = _migrate_layer_map(cfg.get("link_colors", {}))
    for layer in ("notes", "priority", "families", "note_links", "examples", "kanji"):
        if layer in cfg["link_colors"]:
            continue
        from_layer = cfg["layer_colors"].get(layer)
        if isinstance(from_layer, str) and from_layer.strip():
            cfg["link_colors"][layer] = from_layer
            continue
        fallback = DEFAULT_CFG.get("link_colors", {}).get(layer)
        if isinstance(fallback, str) and fallback.strip():
            cfg["link_colors"][layer] = fallback
    cfg["layer_enabled"] = _migrate_layer_map(cfg.get("layer_enabled", {}), copy_family_to_notes=True)
    cfg["layer_styles"] = _migrate_layer_map(cfg.get("layer_styles", {}))
    cfg["layer_flow"] = _migrate_layer_map(cfg.get("layer_flow", {}))
    cfg["link_strengths"] = _migrate_layer_map(cfg.get("link_strengths", {}))
    cfg["link_weights"] = _migrate_layer_map(cfg.get("link_weights", {}))
    cfg["link_weight_modes"] = _migrate_layer_map(cfg.get("link_weight_modes", {}))
    cfg["link_distances"] = _migrate_layer_map(cfg.get("link_distances", {}))
    # Remove legacy static Mass Linker layer keys; provider layers are dynamic now.
    for legacy_key in ("mass_links",):
        cfg["layer_enabled"].pop(legacy_key, None)
        cfg["layer_colors"].pop(legacy_key, None)
        cfg["link_colors"].pop(legacy_key, None)
        cfg["layer_styles"].pop(legacy_key, None)
        cfg["layer_flow"].pop(legacy_key, None)
        cfg["link_strengths"].pop(legacy_key, None)
        cfg["link_weights"].pop(legacy_key, None)
        cfg["link_weight_modes"].pop(legacy_key, None)
        cfg["link_distances"].pop(legacy_key, None)
    cfg["solver"] = _merge_section_defaults(cfg.get("solver"), DEFAULT_CFG.get("solver", {}))
    cfg["engine"] = _merge_section_defaults(cfg.get("engine"), DEFAULT_CFG.get("engine", {}))
    cfg["renderer"] = _merge_section_defaults(cfg.get("renderer"), DEFAULT_CFG.get("renderer", {}))
    cfg["node"] = _merge_section_defaults(cfg.get("node"), DEFAULT_CFG.get("node", {}))
    cfg.pop("physics", None)
    if not isinstance(cfg.get("neighbor_scaling"), dict):
        cfg["neighbor_scaling"] = DEFAULT_CFG.get("neighbor_scaling", {}).copy()
    nscale = cfg.get("neighbor_scaling") or {}
    mode = nscale.get("mode")
    if not isinstance(mode, str) or mode not in ("none", "ccm", "twohop", "jaccard", "overlap", "common_neighbors"):
        mode = DEFAULT_CFG["neighbor_scaling"]["mode"]
    directed = nscale.get("directed")
    if not isinstance(directed, str) or directed not in ("undirected", "out", "in"):
        directed = DEFAULT_CFG["neighbor_scaling"]["directed"]
    weights_in = nscale.get("weights")
    if not isinstance(weights_in, dict):
        weights_in = {}
    weights_in = _migrate_layer_map(weights_in, copy_family_to_priority=True, copy_family_to_notes=False)
    defaults = DEFAULT_CFG["neighbor_scaling"]["weights"]
    weights: dict[str, float] = {}
    for key, default in defaults.items():
        val = weights_in.get(key)
        if isinstance(val, (int, float)):
            weights[key] = float(val)
        else:
            weights[key] = float(default)
    weights.pop("mass_links", None)
    cfg["neighbor_scaling"] = {"mode": mode, "directed": directed, "weights": weights}
    if not isinstance(cfg.get("family_same_prio_edges"), bool):
        cfg["family_same_prio_edges"] = False
    if not isinstance(cfg.get("family_same_prio_opacity"), (int, float)):
        cfg["family_same_prio_opacity"] = DEFAULT_CFG["family_same_prio_opacity"]
    if not isinstance(cfg.get("family_chain_edges"), bool):
        cfg["family_chain_edges"] = DEFAULT_CFG["family_chain_edges"]
    if not isinstance(cfg.get("layer_flow_speed"), (int, float)):
        cfg["layer_flow_speed"] = DEFAULT_CFG["layer_flow_speed"]
    if not isinstance(cfg.get("layer_flow_spacing_mul"), (int, float)):
        cfg["layer_flow_spacing_mul"] = DEFAULT_CFG["layer_flow_spacing_mul"]
    if not isinstance(cfg.get("layer_flow_radius_mul"), (int, float)):
        cfg["layer_flow_radius_mul"] = DEFAULT_CFG["layer_flow_radius_mul"]
    if not isinstance(cfg.get("trailing_hub_distance"), (int, float)):
        cfg["trailing_hub_distance"] = DEFAULT_CFG["trailing_hub_distance"]
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


def set_mass_linker_group_hubs(groups: list[str]) -> None:
    cfg = load_graph_config()
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in groups or []:
        grp = str(raw or "").strip()
        if not grp:
            continue
        key = grp.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(grp)
    cfg["mass_linker_group_hubs"] = cleaned
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


def set_layer_flow_spacing_mul(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["layer_flow_spacing_mul"] = float(value)
    except Exception:
        return
    save_graph_config(cfg)


def set_layer_flow_radius_mul(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["layer_flow_radius_mul"] = float(value)
    except Exception:
        return
    save_graph_config(cfg)


def set_trailing_hub_distance(value: float) -> None:
    cfg = load_graph_config()
    try:
        cfg["trailing_hub_distance"] = float(value)
    except Exception:
        return
    save_graph_config(cfg)


def set_solver_value(key: str, value: Any) -> None:
    cfg = load_graph_config()
    key = (key or "").strip()
    if not key:
        return
    if "solver" not in cfg or not isinstance(cfg.get("solver"), dict):
        cfg["solver"] = DEFAULT_CFG.get("solver", {}).copy()
    if key not in DEFAULT_CFG.get("solver", {}):
        return
    if key in _SOLVER_BOOL_KEYS:
        cfg["solver"][key] = _parse_bool_like(value, bool(DEFAULT_CFG["solver"][key]))
    else:
        try:
            cfg["solver"][key] = float(value)
        except Exception:
            return
    save_graph_config(cfg)


def set_link_color(layer: str, color: str) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    color = (color or "").strip()
    if not layer:
        return
    if not color or color.lower() == "auto":
        cfg["link_colors"].pop(layer, None)
    else:
        cfg["link_colors"][layer] = color
    save_graph_config(cfg)


def set_renderer_value(key: str, value: Any) -> None:
    cfg = load_graph_config()
    key = (key or "").strip()
    if not key:
        return
    if "renderer" not in cfg or not isinstance(cfg.get("renderer"), dict):
        cfg["renderer"] = DEFAULT_CFG.get("renderer", {}).copy()
    if key not in DEFAULT_CFG.get("renderer", {}):
        return
    if key in _RENDERER_BOOL_KEYS:
        cfg["renderer"][key] = _parse_bool_like(value, bool(DEFAULT_CFG["renderer"][key]))
    else:
        try:
            cfg["renderer"][key] = float(value)
        except Exception:
            return
    save_graph_config(cfg)


def set_engine_value(key: str, value: Any) -> None:
    cfg = load_graph_config()
    key = (key or "").strip()
    if not key:
        return
    if "engine" not in cfg or not isinstance(cfg.get("engine"), dict):
        cfg["engine"] = DEFAULT_CFG.get("engine", {}).copy()
    if key not in DEFAULT_CFG.get("engine", {}):
        return
    if key in _ENGINE_BOOL_KEYS:
        cfg["engine"][key] = _parse_bool_like(value, bool(DEFAULT_CFG["engine"][key]))
    else:
        try:
            cfg["engine"][key] = float(value)
        except Exception:
            return
    save_graph_config(cfg)


def set_node_value(key: str, value: Any) -> None:
    cfg = load_graph_config()
    key = (key or "").strip()
    if not key:
        return
    if "node" not in cfg or not isinstance(cfg.get("node"), dict):
        cfg["node"] = DEFAULT_CFG.get("node", {}).copy()
    if key not in DEFAULT_CFG.get("node", {}):
        return
    if key in _NODE_BOOL_KEYS:
        cfg["node"][key] = _parse_bool_like(value, bool(DEFAULT_CFG["node"][key]))
    else:
        try:
            cfg["node"][key] = float(value)
        except Exception:
            return
    save_graph_config(cfg)


def set_neighbor_scaling(cfg_in: dict[str, Any]) -> None:
    cfg = load_graph_config()
    nscale = cfg.get("neighbor_scaling") or {}
    mode = cfg_in.get("mode")
    if isinstance(mode, str) and mode in ("none", "ccm", "twohop", "jaccard", "overlap", "common_neighbors"):
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


def set_link_weight(layer: str, weight: float) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    if not layer:
        return
    try:
        value = float(weight)
    except Exception:
        return
    cfg.setdefault("link_weights", {})
    cfg["link_weights"][layer] = value
    save_graph_config(cfg)


def set_link_weight_mode(layer: str, mode: str) -> None:
    cfg = load_graph_config()
    layer = (layer or "").strip()
    mode = (mode or "").strip().lower()
    if not layer:
        return
    if mode not in ("manual", "metric"):
        mode = "manual"
    cfg.setdefault("link_weight_modes", {})
    cfg["link_weight_modes"][layer] = mode
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
