# Changelog

## Unreleased - 2026-02-15

### Major Updates
- None.

### Minor Updates
- Added a new end-to-end delta pipeline for note changes:
  - Python subgraph slice builder: `build_note_delta_slice(...)` (`graph_data.py`)
  - Python rev/order dispatch queue: `_enqueue_note_delta` / `_dispatch_note_delta` (`graph_sync.py`)
  - JS unified mod pipeline for full+delta slices (`web/graph.payload.js`)
  - JS diff/state patch ops (`node_add/node_update/node_drop`, `edge_upsert/edge_drop`)
  - Engine runtime delta patch port: `applyGraphDeltaOps` (`web/graph.engine.sigma.js`)
- Added solver helper `runSubsetNoDampingPull(nodeIds, options)` in `web/graph.solver.d3.js` to run an extra subset-only simulation with `velocityDecay(0)` and write back node positions.
- Added monotonic delta revision snapshots in full payload meta (`meta.delta_rev`) and JS stale/gap handling with controlled full-refresh recovery.

### Fixes
- Fixed right-click/context stability after note edits by remapping runtime index/state on delta apply instead of forcing full engine rebuild.
- Fixed immediate styling of newly upserted links by running full edge-mod pipeline before diff and applying Graphology patch + runtime style pass in the same delta tick.
- Fixed bidirectional note-link duplication in delta slices by coalescing opposite note-link directions into one visual edge (+ reverse flow-only edge metadata path).
- Fixed flow animation startup for active selection after delta by reapplying visual/runtime flow masks immediately after patch.
- Fixed delta note-edit lag spikes and small node jumps by removing per-delta physics config re-apply (no solver re-init inside `applyGraphDeltaOps`).
- Added alpha-only solver reheat for edge-changing delta updates (`reheat(1.25)`), so delta edge changes can nudge physics without rebuilding the solver simulation.
- Added explicit delta reheat logs (trigger/skip/failure with rev/edge op counts/requested alpha) and solver reheat logs with the effective applied alpha.
- Routed all city->engine runtime graph method calls through adapter engine port `graphCall(...)` and removed direct city-side `STATE.graph.*` calls.
- Added adapter contract registry (`register/get/list` for city+engine ports) and declared explicit `graphCall` method contracts (required args + return shape) as central runtime API reference.
- Limited delta neighbor expansion to one hop from changed notes to prevent transitive recursive slice blowups on context link/unlink operations.
- Removed automatic note-focus/zoom on note-edit delta events, so simple field edits do not trigger camera jumps or search-ping visuals.
- Fixed context family connect/disconnect config mismatch by switching `graph_note_ops` family config reads to the same shared tools-config resolver used by graph build.
- Centralized Family Gate config parsing into `graph_data._get_family_gate_config(...)` and wired build + ctx mutation paths to this single mapper to avoid future key-drift across call sites.
- Refactored graph logger to main-addon style level gating and module tags, including `logger.configure(...)` and JS bridge level routing (`log:info|warn|error|debug:`).
- Kept `_FORCE_LOGGING` as API-outage fallback and enabled automatic debug-level logging when tools API config is unavailable.
- Added API debug payload fields in AJpC Tools graph config response (`debug.level`, `debug.module_logs`, `debug.module_levels`) for graph-side level/module filtering.
- Added a context-menu connect option for `active note + context family hub`, so selected family hubs can now add their family directly to the active note.
- Replaced legacy context-menu selected/active dots with SVG icon assets (`web/assets/ctx-icons/*.svg`) rendered via hardcoded per-entry `iconSpec` in `web/ui/graph.ui.ctx.js`; `iconSpec` now supports optional `mode/color` with defaults `fixed + var(--text-main)`.

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
