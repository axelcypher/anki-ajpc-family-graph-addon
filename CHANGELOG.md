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
- Moved Mass Linker group-hub controls into the Mass Linker layer card in Link Settings.

### Fixes
- Improved reliability of note focus handoff when the graph window opens from a context action.
- Removed legacy static `mass_links` layer handling in graph addon config/runtime; provider links now resolve only via API-driven dynamic provider layers.
- Synced layer visibility both ways between toolbar layer pills and Link Settings.
- Updated Link Settings card collapse behavior: collapsed follows hidden-by-default, but can now be expanded independently by clicking the layer name/collapse indicator.
- Delta updates no longer route through full frontend `applyGraphData()` rebuild; note edits/new notes now use a dedicated incremental engine delta path that patches graph nodes/edges in-place.
- Fixed partial delta-node merge so unchanged node fields are preserved instead of being overwritten by sparse patch payloads.
- Fixed full-build vs delta edge-key mismatch by using stable edge IDs in full graph builds, preventing mass edge churn/freeze behavior on first delta apply.
