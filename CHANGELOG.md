# Changelog

## 1.0.0-beta.1 - 2026-02-14

### Major Updates
- None.

### Minor Updates
- Added Browser context menu action to open and focus the selected note in AJpC Graph.
- Renamed the Browser context action to English: `Show in AJpC Graph`.
- Switched provider-driven links to AJpC Tools API payload (`get_link_provider_edges`) and render them on dynamic per-provider layers (`provider_<id>`), instead of hardcoded Mass-Linker config parsing in graph addon.
- Added incremental note-delta sync path: note text changes now push node/edge patches into the running graph instead of triggering a full graph rebuild.
- Added Links-menu setting for Mass Linker group hubs: selectable Mass Linker `group` values can now be collapsed into dedicated hub nodes.

### Fixes
- Improved reliability of note focus handoff when the graph window opens from a context action.
- Removed legacy static `mass_links` layer handling in graph addon config/runtime; provider links now resolve only via API-driven dynamic provider layers.
