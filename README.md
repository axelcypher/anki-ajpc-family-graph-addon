# AJpC Family Graph

AJpC Family Graph is a visual companion for the AJpC Tools add-on. It reads your **Family Gate**, **Example Gate**, **Kanji Gate**, and **Linked Notes (Note Linker)** configuration and renders them as an interactive graph.

> **Required:** This add-on only works together with **AJpC Tools**. It pulls data through the Tools add-on API and will not work on its own.

![Graph UI](Screenshot-Graph-UI.png)

## How it works (overview)
- **Nodes = Anki notes**, **Edges = relationships** defined by AJpC Tools.
- **Family Gate** creates clusters (families) based on your FamilyID field and priorities.
- **Example Gate** connects vocab notes to example notes.
- **Kanji Gate** connects vocab notes to Kanji notes (and optionally parts if enabled).
- **Linked Notes** shows manual and auto-links (Anki Note Linker style tags/fields).

## Open the graph
- `AJpC -> Show Graph`

## UI tour
### Top toolbar
- **Layer toggles** (click the label):
  - Family Hubs, Family Gate, Linked Notes, Example Gate, Kanji Gate, Show Unlinked.
- **Deck selector** (multi-select): filter which decks are included in the graph.
- **Search**: type to get suggestions, press Enter to jump to the first match, or click a suggestion to zoom to a node.
- **Settings**: opens a right-side panel with tabs.
- **Rebuild**: full re-read of the data.

### Settings panel
**Note Settings**
- Per note type: visibility, label field (Name), linked field, tooltip fields, and color.

**Link Settings**
- Flow speed (global)
- Chain family levels (hub -> prio chain)
- Per layer: color, line style, flow on/off
- Same-priority links toggle + opacity
- Auto-link opacity
- Kanji parts style options (if enabled)

**Physics**
- Repulsion, link distance/strength, decay, cooldown, etc.

## Examples
### Family Gate

- **kita** has: kita at priority 0 (kita or kita@0)
- **deguchi** has: deguchi at priority 0 (deguchi or deguchi@0)
- **~guchi** has: deguchi at priority 1 (deguchi@1)
- **kita-guchi** has: kita at priority 1 and deguchi at priority 2 (kita@1; deguchi@2)

The graph shows two hubs (kita and deguchi) and connects members directly to their hub. So **kita** and **kita-guchi** connect to the **kita** hub, while **deguchi**, **~guchi**, and **kita-guchi** connect to the **deguchi** hub.  
When **Chain family levels** is enabled, chain edges are added by priority: **kita-guchi** connects to **~guchi** and **kita**; **kita** connects to the **kita** hub; **~guchi** connects to **deguchi**, and **deguchi** connects to the **deguchi** hub.

### Linked Notes
If your Linked Notes field contains:

```
[Cause|nid1769835143461]
```

The graph shows a directional link from the current note to that note. If two notes link to each other, you'll see a single line with bidirectional flow.

### Kanji Gate
Vocab notes that contain kanji will connect to the Kanji notes for those characters. You can hide Kanji parts or show them only for the currently selected Kanji.

## Interaction tips
- **Left-click** a node to highlight its direct neighborhood.
- **Right-click** a node for actions:
  - Open Preview
  - Open Editor
  - Filter by Family ID
  - Connect to selected (Family): adds the selected family to the right-clicked note. If the selected item is a **Family Hub**, the new entry is added with prio 0. If the selected item is a **note**, the new entry is added with prio = (selected note prio + 1).
  - Append link to selected: appends a link into the right-clicked note, pointing to the currently selected note (only if that note type has a Linked Notes field configured)

## Notes
- The graph reflects your **AJpC Tools config**, so if the config changes, the graph changes.
- All actions are visual only, except the context actions that explicitly write to your notes.

---
