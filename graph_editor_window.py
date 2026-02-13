from __future__ import annotations

import aqt
import aqt.editor
import aqt.forms
from aqt import gui_hooks, mw
from aqt.qt import QDialogButtonBox, QKeySequence, QMainWindow, Qt
from aqt.utils import add_close_shortcut, restoreGeom, saveGeom


class GraphNoteEditor(QMainWindow):
    def __init__(self, nid: int) -> None:
        super().__init__(None, Qt.WindowType.Window)
        assert mw is not None and mw.col is not None
        self.mw = mw
        self.nid = nid
        self.form = aqt.forms.editcurrent.Ui_Dialog()
        self.form.setupUi(self)
        self.setWindowTitle("AJpC Graph Editor")
        self.editor = aqt.editor.Editor(
            self.mw,
            self.form.fieldsArea,
            self,
            editor_mode=aqt.editor.EditorMode.BROWSER,
        )
        note = self.mw.col.get_note(nid)
        self.editor.set_note(note, focusTo=0)
        restoreGeom(self, "ajpc_family_graph_editor", default_size=(800, 700))
        close_button = self.form.buttonBox.button(QDialogButtonBox.StandardButton.Close)
        if close_button is not None:
            close_button.setShortcut(QKeySequence("Ctrl+Return"))
        add_close_shortcut(self)
        gui_hooks.operation_did_execute.append(self.on_operation_did_execute)
        self.show()

    def on_operation_did_execute(self, changes, handler) -> None:
        if not changes.note_text or handler is self.editor:
            return
        note = self.editor.note
        if note is None:
            return
        try:
            note.load()
        except Exception:
            self.cleanup()
            self.close()
            return
        self.editor.set_note(note)

    def cleanup(self) -> None:
        try:
            gui_hooks.operation_did_execute.remove(self.on_operation_did_execute)
        except Exception:
            pass
        try:
            self.editor.cleanup()
        except Exception:
            pass
        saveGeom(self, "ajpc_family_graph_editor")
