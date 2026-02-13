from __future__ import annotations

import json
import os
import re

import aqt
import aqt.editor
import aqt.forms
from aqt import mw
from aqt.qt import (
    QEasingCurve,
    QFrame,
    QLabel,
    QMainWindow,
    QPropertyAnimation,
    QRect,
    QVBoxLayout,
    QWidget,
    Qt,
    QTimer,
)
from aqt.utils import setWindowIcon
from PyQt6.QtWebEngineWidgets import QWebEngineView

from . import logger

ADDON_DIR = os.path.dirname(__file__)
WEB_DIR = os.path.join(ADDON_DIR, "web")
EMBED_EDITOR_CSS_START = "AJPC_EMBED_EDITOR_CSS_START"
EMBED_EDITOR_CSS_END = "AJPC_EMBED_EDITOR_CSS_END"
EMBED_EDITOR_CSS_SCOPE = "#editor-anki"


class EmbeddedEditorMixin:
    def _init_embedded_editor_panel(self) -> None:
        # Native embedded editor panel (left side).
        self._editor_panel = QWidget(self)
        self._editor_panel.setObjectName("ajpcEmbeddedEditorPanel")
        self._editor_panel.setMinimumWidth(360)
        self._editor_panel.setMaximumWidth(720)
        self._editor_panel.setVisible(False)
        self._editor_panel_open = False
        self._embedded_editor_nid = 0
        self._embedded_editor = None
        self._embedded_editor_form = None
        self._embedded_editor_root = None
        self._embedded_editor_devtools = None
        self._editor_panel_rect: dict[str, int | bool] = {"visible": False, "x": 0, "y": 0, "w": 0, "h": 0}
        self._editor_panel_transition_ms = 180
        self._editor_panel_transition_extra_ms = 450
        self._editor_panel_anim: QPropertyAnimation | None = None
        self._editor_panel_closing = False
        self._embedded_editor_theme_css = ""
        self._embedded_editor_theme_css_mtime = 0.0

        editor_layout = QVBoxLayout(self._editor_panel)
        editor_layout.setContentsMargins(0, 0, 0, 0)
        editor_layout.setSpacing(0)

        self._editor_mount = QWidget(self._editor_panel)
        self._editor_mount.setObjectName("ajpcEmbeddedEditorMount")
        self._editor_mount_layout = QVBoxLayout(self._editor_mount)
        self._editor_mount_layout.setContentsMargins(0, 0, 0, 0)
        self._editor_mount_layout.setSpacing(2)
        self._editor_hint = QLabel("Select a note and press Editor to open the embedded Anki editor.", self._editor_mount)
        self._editor_hint.setWordWrap(True)
        self._editor_mount_layout.addWidget(self._editor_hint)

        editor_layout.addWidget(self._editor_mount, 1)
        self._editor_panel.setParent(self)
        self._apply_embedded_editor_panel_style()

    def _apply_embedded_editor_panel_style(self) -> None:
        bg = self._get_embedded_editor_panel_bg_color()
        btn_bg = self._resolve_embedded_css_value("var(--bg-btn)") or "#282c35"
        btn_text = self._resolve_embedded_css_value("var(--text-main)") or "#dbdbdb"
        btn_hover_bg = self._resolve_embedded_css_value("var(--bg-btn-soft)") or "#3e4350"
        btn_hover_border = self._resolve_embedded_css_value("var(--border-100)") or "#232427"
        try:
            self._editor_panel.setStyleSheet(
                f"""
                QWidget#ajpcEmbeddedEditorPanel {
                    background: {bg};
                    border-right: 1px solid rgba(100,116,139,115);
                }
                QWidget#ajpcEmbeddedEditorMount {
                    background: transparent;
                }
                QWidget#ajpcEmbeddedEditorPanel QLabel {
                    color: #e2e8f0;
                }
                QWidget#ajpcEmbeddedEditorPanel QPushButton {
                    color: {btn_text};
                    background-color: {btn_bg};
                    border: 0px;
                    border-radius: 6px;
                    padding: 10px;
                }
                QWidget#ajpcEmbeddedEditorPanel QPushButton:hover {
                    background-color: {btn_hover_bg};
                    border-color: {btn_hover_border};
                }
                """
            )
        except Exception:
            pass

    def _update_embedded_editor_geometry(self) -> None:
        panel = self._editor_panel
        if panel is None:
            return
        rect = self._editor_panel_rect if isinstance(self._editor_panel_rect, dict) else {}
        visible = bool(rect.get("visible"))
        x, y, w, h = self._clamped_editor_panel_rect()
        if w <= 0 or h <= 0:
            if not self._editor_panel_open and not self._editor_panel_closing:
                panel.hide()
            return
        if not visible and not self._editor_panel_open and not self._editor_panel_closing:
            panel.hide()
            return
        if self._editor_panel_anim is not None:
            return
        panel.setGeometry(x, y, w, h)
        panel.raise_()
        if self._editor_panel_open or self._editor_panel_closing:
            panel.show()

    def _clamped_editor_panel_rect(self) -> tuple[int, int, int, int]:
        rect = self._editor_panel_rect if isinstance(self._editor_panel_rect, dict) else {}
        visible = bool(rect.get("visible"))
        try:
            x = int(rect.get("x", 0) or 0)
            y = int(rect.get("y", 0) or 0)
            w = int(rect.get("w", 0) or 0)
            h = int(rect.get("h", 0) or 0)
            vw = int(rect.get("vw", 0) or 0)
            vh = int(rect.get("vh", 0) or 0)
        except Exception:
            x, y, w, h, vw, vh = 0, 0, 0, 0, 0, 0
        host_w = max(1, int(self.width()))
        host_h = max(1, int(self.height()))
        sx = (float(host_w) / float(vw)) if vw > 0 else 1.0
        sy = (float(host_h) / float(vh)) if vh > 0 else 1.0
        if sx <= 0:
            sx = 1.0
        if sy <= 0:
            sy = 1.0
        x = int(round(float(x) * sx))
        y = int(round(float(y) * sy))
        w = int(round(float(w) * sx))
        h = int(round(float(h) * sy))
        if x < 0:
            x = 0
        if y < 0:
            y = 0
        if w <= 0:
            w = max(0, host_w - x)
        if h <= 0:
            h = max(0, host_h - y)
        # Web panel is anchored to the bottom of the viewport.
        # If top offset drifts (DPI/rounding), keep bottom edge exact to prevent
        # clipping of lower editor sections like tags.
        if visible and h > 0:
            y = max(0, host_h - h)
        if x + w > host_w:
            w = max(0, host_w - x)
        if y + h > host_h:
            h = max(0, host_h - y)
        return x, y, w, h

    def _stop_embedded_editor_animation(self) -> None:
        anim = self._editor_panel_anim
        if anim is None:
            return
        try:
            anim.stop()
        except Exception:
            pass
        self._editor_panel_anim = None

    def _animate_embedded_editor_panel(self, opening: bool) -> None:
        panel = self._editor_panel
        if panel is None:
            return
        x, y, w, h = self._clamped_editor_panel_rect()
        if w <= 0 or h <= 0:
            if opening:
                panel.hide()
            else:
                panel.hide()
                self._editor_panel_closing = False
            return
        dur = int((self._editor_panel_transition_ms or 180) + (self._editor_panel_transition_extra_ms or 0))
        if dur < 1:
            dur = 1
        off_x = x - (w + 16)
        end_rect = QRect(x, y, w, h)
        if opening:
            start_rect = QRect(off_x, y, w, h)
            self._editor_panel_closing = False
            panel.setGeometry(start_rect)
            panel.show()
            panel.raise_()
        else:
            current = panel.geometry()
            if current.width() <= 0 or current.height() <= 0:
                current = QRect(x, y, w, h)
            start_rect = current
            end_rect = QRect(off_x, y, w, h)
            self._editor_panel_closing = True
        self._stop_embedded_editor_animation()
        anim = QPropertyAnimation(panel, b"geometry", panel)
        anim.setDuration(dur)
        anim.setEasingCurve(QEasingCurve.Type.InOutCubic)
        anim.setStartValue(start_rect)
        anim.setEndValue(end_rect)
        if opening:
            def _done_open() -> None:
                try:
                    panel.setGeometry(QRect(x, y, w, h))
                    panel.raise_()
                except Exception:
                    pass
                self._editor_panel_anim = None
        else:
            def _done_close() -> None:
                try:
                    panel.hide()
                except Exception:
                    pass
                self._editor_panel_closing = False
                self._editor_panel_anim = None
        try:
            anim.finished.connect(_done_open if opening else _done_close)
        except Exception:
            pass
        self._editor_panel_anim = anim
        anim.start()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._update_embedded_editor_geometry()

    def _ensure_embedded_editor(self) -> bool:
        if self._embedded_editor is not None:
            return True
        if mw is None or getattr(mw, "col", None) is None:
            return False
        try:
            # editcurrent.Ui_Dialog expects a MainWindow-like host (uses setCentralWidget).
            self._embedded_editor_root = QMainWindow(self._editor_mount, Qt.WindowType.Widget)
            try:
                self._embedded_editor_root.setWindowFlags(Qt.WindowType.Widget)
            except Exception:
                pass
            self._embedded_editor_form = aqt.forms.editcurrent.Ui_Dialog()
            self._embedded_editor_form.setupUi(self._embedded_editor_root)
            # Remove default outer Qt margins from the embedded editcurrent form host.
            try:
                self._embedded_editor_root.setContentsMargins(0, 0, 0, 0)
            except Exception:
                pass
            try:
                cw = self._embedded_editor_root.centralWidget()
            except Exception:
                cw = None
            if cw is not None:
                try:
                    cw.setContentsMargins(0, 0, 0, 0)
                except Exception:
                    pass
                try:
                    lay = cw.layout()
                except Exception:
                    lay = None
                if lay is not None:
                    try:
                        lay.setContentsMargins(0, 0, 0, 0)
                    except Exception:
                        pass
            self._editor_mount_layout.addWidget(self._embedded_editor_root, 1)
            self._embedded_editor = aqt.editor.Editor(
                mw,
                self._embedded_editor_form.fieldsArea,
                self,
                editor_mode=aqt.editor.EditorMode.BROWSER,
            )
            try:
                if getattr(self._embedded_editor_form, "buttonBox", None) is not None:
                    self._embedded_editor_form.buttonBox.hide()
            except Exception:
                pass
            self._strip_embedded_editor_chrome()
            self._editor_hint.setVisible(False)
            self._theme_embedded_editor_web()
            logger.dbg("embedded editor ready")
            return True
        except Exception as exc:
            logger.dbg("embedded editor init failed", repr(exc))
            return False

    def _theme_embedded_editor_web(self) -> None:
        editor = self._embedded_editor
        if editor is None:
            return
        css = self._get_embedded_editor_theme_css()
        if not css:
            return
        self._apply_embedded_editor_panel_style()
        css_js = json.dumps(css)
        js = (
            "(function(){"
            "try{"
            "var id='ajpc-graph-editor-theme';"
            f"var css={css_js};"
            "var st=document.getElementById(id);"
            "if(!st){st=document.createElement(\"style\");st.id=id;document.head.appendChild(st);}st.textContent=css;"
            "var ensureControls=function(){"
            " if(!document||!document.body) return;"
            " if(!document.querySelector('.collapse-label,#fields,.fields,.field-container,.editor-field,.editor-toolbar,.toolbar')) return;"
            " var sid='ajpc-graph-editor-web-controls-style';"
            " var s=document.getElementById(sid);"
            " if(!s){"
            "  s=document.createElement('style');"
            "  s.id=sid;"
            "  s.textContent='"
            "#ajpc-graph-editor-web-controls{display:flex;justify-content:flex-end;gap:8px;padding:6px 8px 4px 8px;box-sizing:border-box;}"
            "#ajpc-graph-editor-web-controls button{"
            "border-radius:var(--radius-small)!important;"
            "border:1px solid var(--border-100)!important;"
            "background:var(--bg-btn)!important;"
            "color:var(--text-main)!important;"
            "padding:8px 10px!important;"
            "font-size:13px!important;"
            "cursor:pointer;"
            "font-weight:600;"
            "}"
            "#ajpc-graph-editor-web-controls button:hover,"
            "#ajpc-graph-editor-web-controls button:focus-visible{"
            "border:1px solid var(--border-100)!important;"
            "background:var(--bg-btn-soft)!important;"
            "color:var(--text-main)!important;"
            "outline:none;"
            "}"
            ".ajpc-tag-sticky{"
            "position:sticky!important;"
            "bottom:0!important;"
            "z-index:12!important;"
            "background:var(--bg-panel)!important;"
            "padding-bottom:8px!important;"
            "}"
            ".ajpc-tag-sticky .tag-editor{"
            "margin-bottom:0!important;"
            "}"
            "';"
            "  document.head.appendChild(s);"
            " }"
            " var bar=document.getElementById('ajpc-graph-editor-web-controls');"
            " if(!bar){"
            "  bar=document.createElement('div');"
            "  bar.id='ajpc-graph-editor-web-controls';"
            "  var dev=document.createElement('button');"
            "  dev.type='button';"
            "  dev.id='ajpc-graph-editor-devtools';"
            "  dev.textContent='DevTools';"
            "  var close=document.createElement('button');"
            "  close.type='button';"
            "  close.id='ajpc-graph-editor-close';"
            "  close.textContent='Close';"
            "  bar.appendChild(dev);"
            "  bar.appendChild(close);"
            "  if(document.body.firstChild) document.body.insertBefore(bar,document.body.firstChild);"
            "  else document.body.appendChild(bar);"
            " }"
            " var sendCmd=function(msg){"
            "  try{if(window.pycmd){window.pycmd(msg);return;}}catch(_e4){}"
            "  try{if(window.anki&&typeof window.anki.pycmd==='function'){window.anki.pycmd(msg);return;}}catch(_e5){}"
            " };"
            " var devBtn=document.getElementById('ajpc-graph-editor-devtools');"
            " if(devBtn&&!devBtn.__ajpcBound){"
            "  devBtn.__ajpcBound=1;"
            "  devBtn.addEventListener('click',function(ev){"
            "   try{ev.preventDefault();ev.stopPropagation();sendCmd('embed_editor:devtools');}catch(_e2){}"
            "  });"
            " }"
            " var closeBtn=document.getElementById('ajpc-graph-editor-close');"
            " if(closeBtn&&!closeBtn.__ajpcBound){"
            "  closeBtn.__ajpcBound=1;"
            "  closeBtn.addEventListener('click',function(ev){"
            "   try{ev.preventDefault();ev.stopPropagation();sendCmd('embed_editor:close');}catch(_e3){}"
            "  });"
            " }"
            " var tagEditors=document.querySelectorAll('.tag-editor');"
            " for(var ti=0;ti<tagEditors.length;ti++){"
            "  var te=tagEditors[ti];"
            "  if(!te) continue;"
            "  var host=(te.closest&&te.closest('.field-container'))||(te.closest&&te.closest('.collapsible'))||te.parentElement;"
            "  if(host&&host.classList&&!(host.classList.contains('ajpc-tag-sticky'))){"
            "   host.classList.add('ajpc-tag-sticky');"
            "  }"
            " }"
            "};"
            # Hide top "Edit" caption + top divider and suppress addon toolbar commands.
            "var hideChrome=function(){"
            " ensureControls();"
            " var candidates=document.querySelectorAll('a,span,div,label,button');"
            " for(var i=0;i<candidates.length;i++){"
            "   var el=candidates[i];"
            "   if(!el) continue;"
            "   var t=(el.textContent||'').replace(/\\s+/g,' ').trim();"
            "   if(t!=='Edit') continue;"
            "   var r=el.getBoundingClientRect();"
            "   if(r&&r.top<260&&r.left<260&&r.height<=64){"
            "     var host=(el.closest&&el.closest('a,span,div,label,button'))||el;"
            "     host.style.display='none';"
            "   }"
            " }"
            " var hrs=document.querySelectorAll('hr');"
            " for(var j=0;j<hrs.length;j++){"
            "   var hr=hrs[j];"
            "   var rr=hr.getBoundingClientRect();"
            "   if(rr&&rr.top<260){hr.style.display='none';}"
            " }"
            " var cmdTargets=["
            "  '_ajpc_browser_graph_toggle_prio',"
            "  '_ajpc_browser_graph_toggle_graph',"
            "  '_ajpc_browser_graph_toggle'"
            " ];"
            " for(var ci=0;ci<cmdTargets.length;ci++){"
            "   var cmd=cmdTargets[ci];"
            "   var nodes=document.querySelectorAll('[data-command=\"'+cmd+'\"]');"
            "   for(var ni=0;ni<nodes.length;ni++){"
            "     var n=nodes[ni];"
            "     var host=(n.closest&&n.closest('button,a,[role=\"button\"],.hitem,.linkb,.btn'))||n;"
            "     host.style.display='none';"
            "   }"
            " }"
            " var labels=document.querySelectorAll('.collapse-label');"
            " for(var li=0;li<labels.length;li++){"
            "   var label=labels[li];"
            "   if(!label) continue;"
            "   var moved='';"
            "   var nodes=label.childNodes||[];"
            "   for(var ni2=0;ni2<nodes.length;ni2++){"
            "     var n2=nodes[ni2];"
            "     if(!n2) continue;"
            "     if(n2.nodeType===3){"
            "       var tx=((n2.textContent||'').replace(/\\s+/g,' ').trim());"
            "       if(/^\\d+\\s+Tags?$/i.test(tx)){moved=tx;n2.textContent='';}"
            "       continue;"
            "     }"
            "     if(n2.nodeType===1){"
            "       var cls=String(n2.className||'');"
            "       if(cls.indexOf('label-name')>=0){"
            "         var ex2=((n2.textContent||'').replace(/\\s+/g,' ').trim());"
            "         if(!moved&&/^\\d+\\s+Tags?$/i.test(ex2)){moved=ex2;}"
            "         continue;"
            "       }"
            "       if(cls.indexOf('ajpc-tag-count')>=0){"
            "         var old=((n2.textContent||'').replace(/\\s+/g,' ').trim());"
            "         if(!moved&&/^\\d+\\s+Tags?$/i.test(old)){moved=old;}"
            "         n2.remove();"
            "         continue;"
            "       }"
            "       var ex3=((n2.textContent||'').replace(/\\s+/g,' ').trim());"
            "       if(/^\\d+\\s+Tags?$/i.test(ex3)){moved=ex3;n2.remove();}"
            "     }"
            "   }"
            "   if(!moved){"
            "     var existing=(label.querySelector&&label.querySelector('.label-name'))||null;"
            "     if(existing){"
            "       var ex=((existing.textContent||'').replace(/\\s+/g,' ').trim());"
            "       if(/^\\d+\\s+Tags?$/i.test(ex)){moved=ex;}"
            "     }"
            "   }"
            "   if(moved){"
            "     var slot=(label.querySelector&&label.querySelector('.label-name'))||null;"
            "     if(!slot){slot=document.createElement('span');slot.className='label-name';label.appendChild(slot);}"
            "     slot.textContent=moved;"
            "   }"
            " }"
            "};"
            "hideChrome();"
            "requestAnimationFrame(hideChrome);"
            "setTimeout(hideChrome,80);"
            "setTimeout(hideChrome,220);"
            "if(!window.__ajpcEditorChromeObs&&window.MutationObserver){"
            " window.__ajpcEditorChromeObs=new MutationObserver(function(){hideChrome();});"
            " window.__ajpcEditorChromeObs.observe(document.body,{childList:true,subtree:true});"
            "}"
            "}catch(_e){}"
            "})();"
        )
        webs = []
        try:
            webs.append(getattr(editor, "web", None))
        except Exception:
            pass
        try:
            webs.append(getattr(editor, "toolbarWeb", None))
        except Exception:
            pass
        for wv in webs:
            if wv is None:
                continue
            try:
                wv.eval(js)
            except Exception:
                continue

    def _get_embedded_editor_theme_css(self) -> str:
        css_path = os.path.join(WEB_DIR, "graph.css")
        scss_path = os.path.join(WEB_DIR, "scss", "_graph.editor.scss")
        tokens_path = os.path.join(WEB_DIR, "scss", "_graph.tokens.scss")
        try:
            mtime = float(os.path.getmtime(css_path))
        except Exception:
            mtime = 0.0
        try:
            scss_mtime = float(os.path.getmtime(scss_path))
        except Exception:
            scss_mtime = 0.0
        try:
            tokens_mtime = float(os.path.getmtime(tokens_path))
        except Exception:
            tokens_mtime = 0.0
        source_mtime = max(mtime, scss_mtime, tokens_mtime)
        if self._embedded_editor_theme_css and source_mtime > 0 and source_mtime <= float(self._embedded_editor_theme_css_mtime):
            return self._embedded_editor_theme_css
        css = ""
        pattern = (
            r"/\*!\s*"
            + re.escape(EMBED_EDITOR_CSS_START)
            + r"\s*\*/(.*?)/\*!\s*"
            + re.escape(EMBED_EDITOR_CSS_END)
            + r"\s*\*/"
        )
        try:
            with open(css_path, "r", encoding="utf-8", errors="ignore") as fh:
                raw = fh.read()
            match = re.search(pattern, raw, flags=re.DOTALL)
            if match:
                css = str(match.group(1) or "").strip()
            if not css:
                css = self._extract_scoped_rules_from_css(raw, EMBED_EDITOR_CSS_SCOPE)
                if css:
                    logger.dbg("embedded editor theme css loaded from graph.css scoped rules")
        except Exception:
            css = ""
        if not css:
            try:
                with open(scss_path, "r", encoding="utf-8", errors="ignore") as fh:
                    raw = fh.read()
                match = re.search(pattern, raw, flags=re.DOTALL)
                if match:
                    css = str(match.group(1) or "").strip()
                    logger.dbg("embedded editor theme css loaded from scss source")
            except Exception:
                css = ""
        if not css:
            css = (
                "html,body{background:#0b1220!important;color:#e2e8f0!important;}"
                "button,input,select,textarea{background:#0f172a!important;color:#e2e8f0!important;border-color:#334155!important;}"
                ".field{background:#0f172a!important;color:#e2e8f0!important;border-color:#334155!important;}"
                ".toolbar{background:#111827!important;border-color:#334155!important;}"
            )
            logger.dbg("embedded editor theme css fallback active")
        css = self._unscope_embedded_editor_theme_css(css)
        root_vars_css = self._get_embedded_editor_root_vars_css()
        if root_vars_css:
            css = root_vars_css + "\n" + css
        self._embedded_editor_theme_css = css
        self._embedded_editor_theme_css_mtime = source_mtime
        return css

    def _extract_scoped_rules_from_css(self, raw_css: str, scope: str) -> str:
        if not raw_css or not scope:
            return ""
        out: list[str] = []
        try:
            for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", raw_css, flags=re.DOTALL):
                selector = str(m.group(1) or "")
                body = str(m.group(2) or "")
                if scope not in selector:
                    continue
                out.append(selector.strip() + "{" + body.strip() + "}")
        except Exception:
            return ""
        return "\n".join(out).strip()

    def _unscope_embedded_editor_theme_css(self, css: str) -> str:
        # Allow SCSS to be safely namespaced in graph.css via #editor-anki, then strip
        # that scope for the editor webview where selectors should be global.
        if not css:
            return ""
        out = str(css)
        scope = EMBED_EDITOR_CSS_SCOPE
        out = out.replace(scope + " ", "")
        out = out.replace(scope + ">", ">")
        out = out.replace(scope + "+", "+")
        out = out.replace(scope + "~", "~")
        out = out.replace(scope + ",", ",")
        out = re.sub(r"\s{2,}", " ", out)
        return out.strip()

    def _get_embedded_editor_root_vars_css(self) -> str:
        # Provide :root variables so var(--...) works inside embedded editor webviews.
        candidates = [
            os.path.join(WEB_DIR, "graph.css"),
            os.path.join(WEB_DIR, "scss", "_graph.tokens.scss"),
        ]
        for path in candidates:
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    raw = fh.read()
            except Exception:
                continue
            match = re.search(r":root\s*,\s*#app\s*\{(.*?)\}", raw, flags=re.DOTALL)
            if match:
                decls = str(match.group(1) or "").strip()
                if decls:
                    return ":root{" + decls + "}"
            match = re.search(r":root\s*\{(.*?)\}", raw, flags=re.DOTALL)
            if match:
                decls = str(match.group(1) or "").strip()
                if decls:
                    return ":root{" + decls + "}"
        return ""

    def _get_embedded_editor_panel_bg_color(self) -> str:
        # Match Qt panel background to the editor body theme variable when available.
        color = self._resolve_embedded_css_value("var(--bg-panel)")
        if color:
            return color
        return "#0b1220"

    def _get_embedded_editor_css_vars(self) -> dict[str, str]:
        raw = self._get_embedded_editor_root_vars_css()
        out: dict[str, str] = {}
        if not raw:
            return out
        for m in re.finditer(r"(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);", raw):
            name = str(m.group(1) or "").strip()
            value = str(m.group(2) or "").strip()
            if name:
                out[name] = value
        return out

    def _resolve_embedded_css_value(self, value: str) -> str:
        vars_map = self._get_embedded_editor_css_vars()
        if not vars_map:
            return str(value or "").strip()

        def _resolve(v: str, depth: int = 0) -> str:
            if depth > 8:
                return v
            s = str(v or "").strip()
            if "color-mix(" in s:
                # Qt QSS cannot parse color-mix; use nearby token fallback.
                return vars_map.get("--bg-chip-100", vars_map.get("--bg-chip", "#3e4350"))
            m = re.search(r"var\((--[a-zA-Z0-9_-]+)\)", s)
            if not m:
                return s
            key = str(m.group(1) or "").strip()
            rep = vars_map.get(key, "")
            if not rep:
                return s
            s = s.replace(f"var({key})", rep)
            return _resolve(s, depth + 1)

        return _resolve(value)

    def _strip_embedded_editor_chrome(self) -> None:
        # Remove legacy top "Edit" caption and divider from embedded Qt form, if present.
        root = self._embedded_editor_root
        if root is None:
            return
        # Hide/remove the native QMainWindow menu bar ("Edit") so no Qt header remains.
        try:
            mb = root.menuBar()
        except Exception:
            mb = None
        if mb is not None:
            try:
                mb.clear()
            except Exception:
                pass
            try:
                mb.setVisible(False)
                mb.hide()
                mb.setMinimumHeight(0)
                mb.setMaximumHeight(0)
            except Exception:
                pass
        try:
            form_mb = getattr(self._embedded_editor_form, "menubar", None)
        except Exception:
            form_mb = None
        if form_mb is not None and form_mb is not mb:
            try:
                form_mb.clear()
            except Exception:
                pass
            try:
                form_mb.setVisible(False)
                form_mb.hide()
                form_mb.setMinimumHeight(0)
                form_mb.setMaximumHeight(0)
            except Exception:
                pass
        try:
            for lbl in root.findChildren(QLabel):
                txt = str(lbl.text() or "").strip().lower()
                if txt == "edit":
                    lbl.hide()
        except Exception:
            pass
        try:
            for frame in root.findChildren(QFrame):
                try:
                    if frame.frameShape() == QFrame.Shape.HLine:
                        frame.hide()
                except Exception:
                    continue
        except Exception:
            pass

    def _show_embedded_editor_widgets(self) -> None:
        # Ensure the nested editor widget tree is visible when mounted in overlay mode.
        try:
            self._editor_mount.setVisible(True)
            self._editor_mount.show()
        except Exception:
            pass
        try:
            if self._embedded_editor_root is not None:
                self._embedded_editor_root.setVisible(True)
                self._embedded_editor_root.show()
                self._embedded_editor_root.raise_()
        except Exception:
            pass
        editor = self._embedded_editor
        if editor is None:
            return
        for attr in ("web", "toolbarWeb"):
            wv = None
            try:
                wv = getattr(editor, attr, None)
            except Exception:
                wv = None
            if wv is None:
                continue
            try:
                wv.setVisible(True)
                wv.show()
                wv.raise_()
            except Exception:
                continue

    def _deferred_set_embedded_editor_note(self, nid: int, focus_to: int = 0) -> None:
        # Some Anki editor webviews can initialize blank when first mounted hidden;
        # replaying set_note after panel show stabilizes rendering.
        if not self._editor_panel_open or self._embedded_editor is None:
            return
        try:
            target_nid = int(nid or 0)
        except Exception:
            target_nid = 0
        if target_nid <= 0 or int(self._embedded_editor_nid or 0) != target_nid:
            return
        if mw is None or getattr(mw, "col", None) is None:
            return
        try:
            note = mw.col.get_note(target_nid)
        except Exception:
            note = None
        if note is None:
            return
        try:
            self._embedded_editor.set_note(note, focusTo=focus_to)
            self._show_embedded_editor_widgets()
            self._theme_embedded_editor_web()
            logger.dbg("embedded editor deferred set_note", target_nid)
        except Exception as exc:
            logger.dbg("embedded editor deferred set_note failed", target_nid, repr(exc))

    def _sync_web_editor_panel_visibility(self, visible: bool) -> None:
        # Keep the web sidebar state in sync when the native editor closes itself
        # (e.g. the embedded Anki "Close" button in the editor form).
        try:
            open_js = "true" if bool(visible) else "false"
            self.web.eval(
                "(function(){"
                "try{"
                f"var open={open_js};"
                "if(typeof window.updateEditorVisibility==='function'){window.updateEditorVisibility(open);return;}"
                "var panel=document.getElementById('editor-panel');"
                "if(!panel) return;"
                "panel.classList.toggle('closed', !open);"
                "panel.setAttribute('aria-hidden', open ? 'false' : 'true');"
                "}catch(_e){}"
                "})();"
            )
        except Exception:
            pass

    def _show_embedded_editor_for_note(self, nid: int, *, focus_to: int = 0) -> bool:
        try:
            nid = int(nid)
        except Exception:
            nid = 0
        if nid <= 0:
            return False
        if mw is None or getattr(mw, "col", None) is None:
            return False
        if not self._ensure_embedded_editor():
            return False
        try:
            note = mw.col.get_note(nid)
        except Exception:
            note = None
        if note is None:
            return False
        try:
            self._embedded_editor_nid = nid
            self._editor_panel_open = True
            if not bool(self._editor_panel_rect.get("visible")):
                host_w = max(1, int(self.width()))
                host_h = max(1, int(self.height()))
                fallback_w = max(360, min(720, int(host_w * 0.42)))
                self._editor_panel_rect = {"visible": True, "x": 0, "y": 0, "w": fallback_w, "h": host_h}
            self._animate_embedded_editor_panel(True)
            self._show_embedded_editor_widgets()
            self._embedded_editor.set_note(note, focusTo=focus_to)
            self._theme_embedded_editor_web()
            QTimer.singleShot(0, lambda n=nid, f=focus_to: self._deferred_set_embedded_editor_note(n, f))
            QTimer.singleShot(120, lambda n=nid, f=focus_to: self._deferred_set_embedded_editor_note(n, f))
            logger.dbg("embedded editor show", nid)
            return True
        except Exception as exc:
            logger.dbg("embedded editor show failed", nid, repr(exc))
            return False

    def _hide_embedded_editor_panel(self) -> None:
        self._editor_panel_open = False
        self._animate_embedded_editor_panel(False)
        self._sync_web_editor_panel_visibility(False)
        logger.dbg("embedded editor hide")

    def _toggle_embedded_editor(self, nid: int) -> bool:
        if self._editor_panel_open:
            self._hide_embedded_editor_panel()
            return True
        if nid > 0:
            return self._show_embedded_editor_for_note(nid)
        if self._embedded_editor_nid > 0:
            return self._show_embedded_editor_for_note(self._embedded_editor_nid)
        return False

    def _cleanup_embedded_editor(self) -> None:
        self._stop_embedded_editor_animation()
        self._editor_panel_closing = False
        if self._embedded_editor_devtools is not None:
            try:
                self._embedded_editor_devtools.close()
            except Exception:
                pass
            self._embedded_editor_devtools = None
        if self._embedded_editor is not None:
            try:
                self._embedded_editor.cleanup()
            except Exception:
                pass
        self._embedded_editor = None
        self._embedded_editor_form = None
        self._embedded_editor_nid = 0

    def _open_embedded_editor_devtools(self) -> None:
        try:
            if getattr(self, "_embedded_editor_devtools", None) is not None:
                try:
                    self._embedded_editor_devtools.raise_()
                    self._embedded_editor_devtools.activateWindow()
                except Exception:
                    pass
                return
            if self._embedded_editor is None and not self._ensure_embedded_editor():
                logger.dbg("embedded editor devtools unavailable: editor not ready")
                return
            target_web = None
            try:
                target_web = getattr(self._embedded_editor, "web", None)
            except Exception:
                target_web = None
            if target_web is None:
                try:
                    target_web = getattr(self._embedded_editor, "toolbarWeb", None)
                except Exception:
                    target_web = None
            if target_web is None:
                logger.dbg("embedded editor devtools unavailable: no webview")
                return
            page = None
            try:
                page = target_web.page()
            except Exception:
                page = None
            if page is None:
                logger.dbg("embedded editor devtools unavailable: no page")
                return
            devtools = QWebEngineView()
            devtools.setWindowTitle("AJpC Embedded Editor DevTools")
            try:
                setWindowIcon(devtools)
            except Exception:
                pass
            devtools.resize(1000, 700)
            devtools.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, True)
            page.setDevToolsPage(devtools.page())
            devtools.show()
            self._embedded_editor_devtools = devtools
            try:
                devtools.destroyed.connect(self._on_embedded_editor_devtools_destroyed)
            except Exception:
                pass
            logger.dbg("embedded editor devtools open")
        except Exception:
            self._embedded_editor_devtools = None

    def _on_embedded_editor_devtools_destroyed(self) -> None:
        self._embedded_editor_devtools = None
