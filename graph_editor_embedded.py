from __future__ import annotations

import json
import math
import os
import re

import aqt
import aqt.editor
import aqt.forms
from aqt import mw
from aqt.qt import (
    QApplication,
    QEvent,
    QEasingCurve,
    QFrame,
    QKeySequence,
    QLabel,
    QMainWindow,
    QObject,
    QPropertyAnimation,
    QRect,
    QShortcut,
    QVBoxLayout,
    QWidget,
    Qt,
    QTimer,
)
from aqt.utils import setWindowIcon
from PyQt6.QtGui import QColor
from PyQt6.QtWebEngineWidgets import QWebEngineView

from . import logger

ADDON_DIR = os.path.dirname(__file__)
WEB_DIR = os.path.join(ADDON_DIR, "web")
EMBED_EDITOR_CSS_SCOPE = "#editor-anki"


class _EmbeddedMenuStyleFilter(QObject):
    def __init__(self, owner: "EmbeddedEditorMixin") -> None:
        super().__init__(owner)
        self._owner = owner

    def eventFilter(self, watched, event) -> bool:
        owner = self._owner
        if owner is None:
            return False
        try:
            if event is not None and event.type() == QEvent.Type.Show:
                # QMenu is imported lazily to avoid import churn at module load time.
                from aqt.qt import QMenu  # type: ignore

                if isinstance(watched, QMenu):
                    owner._style_embedded_qmenu_instance(watched)
        except Exception:
            pass
        return False


class _EmbeddedEditorHost(QMainWindow):
    """Host widget that maps native close/Escape to panel hide + web sync."""

    def __init__(self, owner: "EmbeddedEditorMixin", parent: QWidget) -> None:
        super().__init__(parent, Qt.WindowType.Widget)
        self._owner = owner
        try:
            self.setWindowFlags(Qt.WindowType.Widget)
        except Exception:
            pass
        try:
            self._close_shortcut = QShortcut(QKeySequence(Qt.Key.Key_Escape), self)
            self._close_shortcut.setContext(Qt.ShortcutContext.WidgetWithChildrenShortcut)
            self._close_shortcut.activated.connect(self._request_hide_panel)
        except Exception:
            self._close_shortcut = None

    def _request_hide_panel(self) -> None:
        owner = self._owner
        if owner is None:
            return
        try:
            if bool(getattr(owner, "_editor_panel_open", False)) or bool(getattr(owner, "_editor_panel_closing", False)):
                owner._hide_embedded_editor_panel()
        except Exception:
            pass

    def closeEvent(self, event) -> None:
        # The embedded Anki editor can request native close on Escape.
        # Keep host alive and close the graph-side panel instead.
        was_open = False
        try:
            owner = self._owner
            was_open = bool(getattr(owner, "_editor_panel_open", False)) or bool(
                getattr(owner, "_editor_panel_closing", False)
            )
        except Exception:
            owner = None
        if owner is not None and was_open:
            try:
                owner._hide_embedded_editor_panel()
            except Exception:
                pass
            try:
                event.ignore()
            except Exception:
                pass
            return
        super().closeEvent(event)


class EmbeddedEditorMixin:
    def _embedded_editor_debug_enabled(self) -> bool:
        cfg = None
        try:
            from .graph_data import _get_tools_config

            cfg = _get_tools_config()
        except Exception:
            cfg = None
        if not isinstance(cfg, dict):
            return False
        enabled = bool(cfg.get("debug_enabled", False))
        mode_raw = str(cfg.get("debug_mode") or "").strip().lower()
        if mode_raw in {"1", "true", "on", "debug"}:
            enabled = True
        elif mode_raw in {"0", "false", "off", "none"}:
            enabled = False
        return bool(enabled)

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
        self._editor_panel_transition_open_delay_ms = 100
        self._editor_panel_transition_close_delay_ms = 110
        self._editor_panel_anim: QPropertyAnimation | None = None
        self._editor_panel_closing = False
        self._embedded_editor_preload_done = False
        self._embedded_editor_theme_css = ""
        self._embedded_editor_theme_css_mtime = 0.0
        self._embedded_qmenu_style_filter = None

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
        dur = int(self._editor_panel_transition_ms or 180)
        if dur < 1:
            dur = 1
        delay_ms = int(
            (self._editor_panel_transition_open_delay_ms if opening else self._editor_panel_transition_close_delay_ms) or 0
        )
        if delay_ms < 0:
            delay_ms = 0
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
        # Linear timing: no ramp-up/ramp-down for open/close slide.
        anim.setEasingCurve(QEasingCurve.Type.Linear)
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
        def _start_anim() -> None:
            if self._editor_panel_anim is not anim:
                return
            try:
                anim.start()
            except Exception:
                if self._editor_panel_anim is anim:
                    self._editor_panel_anim = None
                if not opening:
                    self._editor_panel_closing = False
        if delay_ms > 0:
            QTimer.singleShot(delay_ms, _start_anim)
        else:
            _start_anim()

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
            self._embedded_editor_root = _EmbeddedEditorHost(self, self._editor_mount)
            self._hard_set_embedded_editor_transparent_background()
            self._embedded_editor_form = aqt.forms.editcurrent.Ui_Dialog()
            self._embedded_editor_form.setupUi(self._embedded_editor_root)
            # self._hard_set_embedded_editor_transparent_background()
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
            self._hard_set_embedded_editor_transparent_background()
            self._embedded_editor = aqt.editor.Editor(
                mw,
                self._embedded_editor_form.fieldsArea,
                self,
                editor_mode=aqt.editor.EditorMode.BROWSER,
            )
            self._apply_embedded_editor_webview_base_style()
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
        # Enforce transparent baseline before themed CSS injection.
        self._hard_set_embedded_editor_transparent_background()
        css = self._get_embedded_editor_theme_css()
        if not css:
            return
        self._apply_embedded_editor_panel_style()
        css_js = json.dumps(css)
        debug_enabled_js = "true" if self._embedded_editor_debug_enabled() else "false"
        js = r"""
// js
(function(){
try{
if(document){
 var t=String(document.title||'').trim().toLowerCase();
 if(!t||t==='default'){
  document.title='AJpC Embedded Editor';
 }
}
var installWebviewCssGuard=function(){
 try{
  if(window.__ajpcEmbedWebviewCssGuardInstalled){ return; }
  window.__ajpcEmbedWebviewCssGuardInstalled=1;
  var re=/(?:^|\/)webview\.css(?:[?#].*)?$/i;
  var disableLink=function(node){
   if(!node||node.tagName!=='LINK'){ return; }
   var rel=String(node.getAttribute('rel')||'').toLowerCase();
   if(rel&&rel!=='stylesheet'){ return; }
   var href=String(node.getAttribute('href')||'');
   if(!re.test(href)){ return; }
   try{ node.disabled=true; }catch(_e0){}
   try{ node.setAttribute('data-ajpc-disabled','webview-css'); }catch(_e1){}
   try{ if(node.parentNode){ node.parentNode.removeChild(node); } }catch(_e2){}
  };
  var scan=function(){
   try{
    var links=document.querySelectorAll('link[rel=\"stylesheet\"],link[href*=\"webview.css\"]');
    for(var i=0;i<links.length;i++){ disableLink(links[i]); }
   }catch(_e3){}
  };
  scan();
  try{
   var obs=new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
     var added=muts[i].addedNodes||[];
     for(var j=0;j<added.length;j++){
      var n=added[j];
      disableLink(n);
      try{
       if(n&&n.querySelectorAll){
        var nested=n.querySelectorAll('link[rel=\"stylesheet\"],link[href*=\"webview.css\"]');
        for(var k=0;k<nested.length;k++){ disableLink(nested[k]); }
       }
      }catch(_e4){}
     }
    }
   });
   obs.observe(document.documentElement||document,{childList:true,subtree:true});
  }catch(_e5){}
 }catch(_e){}
};
installWebviewCssGuard();
var id='ajpc-graph-editor-theme';
var css=__CSS_JSON__;
var st=document.getElementById(id);
if(!st){st=document.createElement('style');st.id=id;document.head.appendChild(st);}
st.textContent=css;
var ensureControls=function(){
 if(!document||!document.body) return;
 if(!document.querySelector('.collapse-label,#fields,.fields,.field-container,.editor-field,.editor-toolbar,.toolbar')) return;
 var edgeStyleId='ajpc-graph-editor-btn-edge-style';
 var edgeStyle=document.getElementById(edgeStyleId);
 if(!edgeStyle){
  edgeStyle=document.createElement('style');
  edgeStyle.id=edgeStyleId;
  document.head.appendChild(edgeStyle);
 }
 edgeStyle.textContent=
 '.button-group button.ajpc-edge-first{' +
 'border-top-left-radius:11px !important;' +
 'border-bottom-left-radius:11px !important;' +
 '}' +
 '.button-group button.ajpc-edge-last{' +
 'border-top-right-radius:11px !important;' +
 'border-bottom-right-radius:11px !important;' +
 '}';
 var bar=document.getElementById('ajpc-graph-editor-web-controls');
 if(!bar){
  var controlsHtml=`
<div id="ajpc-graph-editor-web-controls">
    <button type="button" id="ajpc-graph-editor-close">Close</button>
    <div id="ajpc-toolbar-debug" class="hidden">
        <button type="button" id="ajpc-graph-editor-devtools">DevTools</button>
        <button type="button" id="ajpc-graph-editor-css-reload">Reload CSS</button>
    </div>
</div>`;
  document.body.insertAdjacentHTML('afterbegin', controlsHtml);
  bar=document.getElementById('ajpc-graph-editor-web-controls');
 }
 var debugWrap=document.getElementById('ajpc-toolbar-debug');
 if(debugWrap&&debugWrap.classList){
  var debugEnabled=__DEBUG_ENABLED__;
  debugWrap.classList.toggle('hidden', !debugEnabled);
 }
 var sendCmd=function(msg){
  try{if(window.pycmd){window.pycmd(msg);return;}}catch(_e4){}
  try{if(window.anki&&typeof window.anki.pycmd==='function'){window.anki.pycmd(msg);return;}}catch(_e5){}
 };
 var devBtn=document.getElementById('ajpc-graph-editor-devtools');
 if(devBtn&&!devBtn.__ajpcBound){
  devBtn.__ajpcBound=1;
  devBtn.addEventListener('click',function(ev){
   try{ev.preventDefault();ev.stopPropagation();sendCmd('embed_editor:devtools');}catch(_e2){}
  });
 }
 var reloadBtn=document.getElementById('ajpc-graph-editor-css-reload');
 if(reloadBtn&&!reloadBtn.__ajpcBound){
  reloadBtn.__ajpcBound=1;
  reloadBtn.addEventListener('click',function(ev){
   try{ev.preventDefault();ev.stopPropagation();sendCmd('embed_editor:cssreload');}catch(_e6){}
  });
 }
 var closeBtn=document.getElementById('ajpc-graph-editor-close');
 if(closeBtn&&!closeBtn.__ajpcBound){
  closeBtn.__ajpcBound=1;
  closeBtn.addEventListener('click',function(ev){
   try{ev.preventDefault();ev.stopPropagation();sendCmd('embed_editor:close');}catch(_e3){}
  });
 }
 var tagEditors=document.querySelectorAll('.tag-editor');
 for(var ti=0;ti<tagEditors.length;ti++){
  var te=tagEditors[ti];
  if(!te) continue;
  var host=(te.closest&&te.closest('.field-container'))||(te.closest&&te.closest('.collapsible'))||te.parentElement;
  if(host&&host.classList&&!(host.classList.contains('ajpc-tag-sticky'))){
   host.classList.add('ajpc-tag-sticky');
  }
 }
};
var scheduleHideChrome=function(){
 try{
  if(window.__ajpcHideChromeScheduled) return;
  window.__ajpcHideChromeScheduled=1;
  requestAnimationFrame(function(){
   window.__ajpcHideChromeScheduled=0;
   hideChrome();
  });
 }catch(_eSchedule){
  try{hideChrome();}catch(_eSchedule2){}
 }
};
var hideChrome=function(){
 if(window.__ajpcHideChromeRunning){
  window.__ajpcHideChromePending=1;
  return;
 }
 window.__ajpcHideChromeRunning=1;
 try{
 ensureControls();
 var applyEditingAreaPairClasses=function(){
  var areas=document.querySelectorAll('.editing-area');
  for(var ai=0;ai<areas.length;ai++){
   var area=areas[ai];
   if(!area||!area.classList) continue;
   var kinds=[];
   var blocks=area.children||[];
   for(var bi=0;bi<blocks.length;bi++){
    var block=blocks[bi];
    if(!block||!block.classList) continue;
    if(!block.classList.contains('collapsible')||!block.classList.contains('full-hide')) continue;
    if(block.classList.contains('hidden')) continue;
    if(block.hasAttribute&&block.hasAttribute('hidden')) continue;
    var kind='';
    var inner=block.children||[];
    for(var ci=0;ci<inner.length;ci++){
     var child=inner[ci];
     if(!child||!child.classList) continue;
     if(child.classList.contains('plain-text-input')){
      if(child.hasAttribute&&child.hasAttribute('hidden')) continue;
      if(child.classList.contains('hidden')) continue;
      kind='plain';
      break;
      continue;
     }
     if(child.classList.contains('rich-text-input')){
      if(child.hasAttribute&&child.hasAttribute('hidden')) continue;
      if(child.classList.contains('hidden')) continue;
      kind='rich';
      break;
      continue;
     }
    }
    if(!kind) continue;
    kinds.push(kind);
    if(kinds.length>=2) break;
   }
   var wantPlainRich=(kinds.length>=2&&kinds[0]==='plain'&&kinds[1]==='rich');
   var wantRichPlain=(kinds.length>=2&&kinds[0]==='rich'&&kinds[1]==='plain');
   area.classList.toggle('ajpc-pair-plain-rich', !!wantPlainRich);
   area.classList.toggle('ajpc-pair-rich-plain', !!wantRichPlain);
 }
 };
 applyEditingAreaPairClasses();
 var normalizeToolbarButtonEdges=function(){
  var groups=document.querySelectorAll('.button-group');
  for(var gi=0;gi<groups.length;gi++){
   var group=groups[gi];
   if(!group) continue;
   var allBtns=group.querySelectorAll('button');
   var visualBtns=[];
   for(var bi=0;bi<allBtns.length;bi++){
    var btn=allBtns[bi];
    if(!btn) continue;
    var owner=(btn.closest&&btn.closest('.button-group'))||null;
    if(owner!==group) continue;
    if((btn.hasAttribute&&btn.hasAttribute('hidden')) || (btn.closest&&btn.closest('[hidden]'))) continue;
    var hiddenByLayout=(btn.getClientRects&&btn.getClientRects().length===0);
    if(hiddenByLayout) continue;
    visualBtns.push(btn);
   }
   var firstBtn=(visualBtns.length?visualBtns[0]:null);
   var lastBtn=(visualBtns.length?visualBtns[visualBtns.length-1]:null);
   for(var bj=0;bj<allBtns.length;bj++){
    var b=allBtns[bj];
    if(!b||!b.classList) continue;
    b.classList.toggle('ajpc-edge-first', b===firstBtn);
    b.classList.toggle('ajpc-edge-last', b===lastBtn);
   }
  }
 };
 try{normalizeToolbarButtonEdges();}catch(_eEdge){}
 var normalizeTagLabelSpans=function(){
  var labels=document.querySelectorAll('.note-editor .collapse-label, .note-editor #ajpc-tag-wrapper .collapse-label');
  console.log('[ajpc][tags] normalize start labels=', labels.length);
  for(var li=0;li<labels.length;li++){
   var label=labels[li];
   var nodes=label.childNodes||[];
   var freeNode=null;
   var freeRaw='';
   var freeMatch=null;
   for(var ni=0;ni<nodes.length;ni++){
    var n=nodes[ni];
    if(!n||n.nodeType!==3) continue;
    var raw=String(n.textContent||'');
    var m=raw.match(/(\d+\s+Tags?)/i);
    if(!m) continue;
    freeNode=n;
    freeRaw=raw;
    freeMatch=m;
    break;
   }
   if(!freeNode||!freeMatch){
    console.log('[ajpc][tags] no free text, keep stale span index=', li);
    continue;
   }
   var stale=label.querySelectorAll('.ajpc-tags-label-wrapper');
   for(var si=0;si<stale.length;si++) stale[si].remove();
   console.log('[ajpc][tags] stale removed=', stale.length, 'index=', li);
   var span=document.createElement('span');
   span.className='label-name ajpc-tags-label-wrapper';
   span.textContent=String(freeMatch[1]).replace(/\s+/g,' ').trim();
   var before=freeRaw.slice(0,freeMatch.index);
   var after=freeRaw.slice(freeMatch.index+freeMatch[1].length);
   var frag=document.createDocumentFragment();
   if(before) frag.appendChild(document.createTextNode(before));
   frag.appendChild(span);
   if(after) frag.appendChild(document.createTextNode(after));
   label.replaceChild(frag,freeNode);
   console.log('[ajpc][tags] wrapped text=', span.textContent, 'labelIndex=', li);
  }
 };
 var pairTagWrapper=function(){
  var editor=document.querySelector('.note-editor');
  if(!editor) return;
  var labels=document.querySelectorAll('.note-editor .collapse-label, .note-editor #ajpc-tag-wrapper .collapse-label');
  var targetLabel=null;
  var targetCollapsible=null;
  for(var li=0;li<labels.length;li++){
   var label=labels[li];
   if(!label.querySelector||!label.querySelector('.ajpc-tags-label-wrapper')) continue;
   var nxt=label.nextElementSibling;
   while(nxt){
    if(nxt.classList&&nxt.classList.contains('collapse-label')) break;
    if(nxt.classList&&nxt.classList.contains('collapsible')){
     targetCollapsible=nxt;
     break;
    }
    nxt=nxt.nextElementSibling;
   }
   if(!targetCollapsible) continue;
   targetLabel=label;
   break;
  }
  if(!targetLabel||!targetCollapsible){
   console.log('[ajpc][tags] no label/collapsible pair found');
   return;
  }
  var wrapper=document.getElementById('ajpc-tag-wrapper');
  if(!wrapper){
   wrapper=document.createElement('div');
   wrapper.id='ajpc-tag-wrapper';
  }
  if(wrapper.parentElement!==editor){
   editor.insertBefore(wrapper,targetLabel);
  }else if(targetLabel.parentElement!==wrapper && wrapper.nextElementSibling!==targetLabel){
   editor.insertBefore(wrapper,targetLabel);
  }
  if(targetLabel.parentElement!==wrapper) wrapper.appendChild(targetLabel);
  if(targetCollapsible.parentElement!==wrapper) wrapper.appendChild(targetCollapsible);
  console.log('[ajpc][tags] wrapper paired');
 };
 window.__ajpcForceTagWrap=function(){
  console.log('[ajpc][tags] force trigger');
  normalizeTagLabelSpans();
  pairTagWrapper();
 };
 }finally{
  window.__ajpcHideChromeRunning=0;
  if(window.__ajpcHideChromePending){
   window.__ajpcHideChromePending=0;
   scheduleHideChrome();
  }
 }
};
scheduleHideChrome();
setTimeout(scheduleHideChrome,80);
setTimeout(scheduleHideChrome,220);
var bindChromeObserver=function(){
 try{
  if(!window.MutationObserver) return;
  var body=(document&&document.body)?document.body:null;
  if(!body) return;
  var opts={childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','hidden','style','aria-expanded','aria-hidden']};
  var obs=window.__ajpcEditorChromeObs||null;
  var target=window.__ajpcEditorChromeObsTarget||null;
  if(obs&&target===body) return;
  if(obs){
   try{obs.disconnect();}catch(_e8){}
  }
  obs=new MutationObserver(function(){
   if(window.__ajpcHideChromeRunning){
    window.__ajpcHideChromePending=1;
    return;
   }
   scheduleHideChrome();
  });
  obs.observe(body,opts);
  window.__ajpcEditorChromeObs=obs;
  window.__ajpcEditorChromeObsTarget=body;
 }catch(_e9){}
};
bindChromeObserver();
setTimeout(bindChromeObserver,0);
setTimeout(bindChromeObserver,120);
}catch(_e){}
})();
// !js
""".replace("__CSS_JSON__", css_js).replace("__DEBUG_ENABLED__", debug_enabled_js)
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

    def _hard_set_embedded_editor_transparent_background(self) -> None:
        menu_qss = self._embedded_editor_qmenu_qss()
        root = getattr(self, "_embedded_editor_root", None)
        if root is not None:
            try:
                root.setStyleSheet("background: transparent;" + menu_qss)
            except Exception:
                pass
            try:
                cw = root.centralWidget()
            except Exception:
                cw = None
            if cw is not None:
                try:
                    cw.setStyleSheet("background: transparent;" + menu_qss)
                except Exception:
                    pass
        self._apply_embedded_editor_webview_base_style()
        self._install_embedded_qmenu_style_filter()

    def _get_embedded_editor_theme_css(self) -> str:
        css_path = os.path.join(WEB_DIR, "graph.css")
        try:
            mtime = float(os.path.getmtime(css_path))
        except Exception:
            mtime = 0.0
        source_mtime = mtime
        if self._embedded_editor_theme_css and source_mtime > 0 and source_mtime <= float(self._embedded_editor_theme_css_mtime):
            return self._embedded_editor_theme_css
        css = ""
        try:
            with open(css_path, "r", encoding="utf-8", errors="ignore") as fh:
                raw = fh.read()
            css = self._extract_scoped_rules_from_css(raw, EMBED_EDITOR_CSS_SCOPE)
            if css:
                logger.dbg("embedded editor theme css loaded from graph.css scoped rules")
        except Exception:
            css = ""
        if not css:
            logger.dbg("embedded editor theme css missing in graph.css scoped rules")
            self._embedded_editor_theme_css = ""
            self._embedded_editor_theme_css_mtime = source_mtime
            return ""
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
        path = os.path.join(WEB_DIR, "graph.css")
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                raw = fh.read()
        except Exception:
            return ""
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
        color = self._resolve_embedded_css_value("var(--ui-surface-base)")
        if color:
            return color
        return "#00000000"

    def _embedded_editor_qmenu_qss(self) -> str:
        popup_bg = self._resolve_embedded_css_value("var(--menu-surface-bg)") or self._resolve_embedded_css_value("var(--glass-surface-card-input-bg)") or "#111827"
        popup_fg = self._resolve_embedded_css_value("var(--ui-text-primary)") or "#e2e8f0"
        popup_border = self._resolve_embedded_css_value("var(--glass-surface-divider)") or "#334155"
        popup_hover = self._resolve_embedded_css_value("var(--bg-chip-100)") or "#1f2937"
        return (
            "QMenu{"
            f"background-color:{popup_bg};"
            f"color:{popup_fg};"
            f"border:1px solid {popup_border};"
            "padding:4px;"
            "}"
            "QMenu::item{"
            "padding:6px 10px;"
            "background:transparent;"
            "}"
            "QMenu::item:selected{"
            f"background-color:{popup_hover};"
            "}"
        )

    def _is_embedded_editor_widget(self, widget) -> bool:
        if widget is None:
            return False
        anchors = []
        try:
            anchors.append(getattr(self, "_editor_panel", None))
        except Exception:
            pass
        try:
            anchors.append(getattr(self, "_embedded_editor_root", None))
        except Exception:
            pass
        editor = getattr(self, "_embedded_editor", None)
        if editor is not None:
            try:
                anchors.append(getattr(editor, "web", None))
            except Exception:
                pass
            try:
                anchors.append(getattr(editor, "toolbarWeb", None))
            except Exception:
                pass
        anchors = [a for a in anchors if a is not None]
        if not anchors:
            return False
        cur = widget
        seen: set[int] = set()
        while cur is not None:
            oid = id(cur)
            if oid in seen:
                break
            seen.add(oid)
            for anchor in anchors:
                try:
                    if cur is anchor:
                        return True
                except Exception:
                    pass
                try:
                    if isinstance(anchor, QWidget) and isinstance(cur, QWidget) and anchor.isAncestorOf(cur):
                        return True
                except Exception:
                    pass
            try:
                cur = cur.parent()
            except Exception:
                cur = None
        return False

    def _is_embedded_editor_qmenu(self, menu) -> bool:
        if menu is None:
            return False
        if not bool(getattr(self, "_editor_panel_open", False)) and not bool(getattr(self, "_editor_panel_closing", False)):
            return False
        if self._is_embedded_editor_widget(menu):
            return True
        try:
            pw = menu.parentWidget()
        except Exception:
            pw = None
        if self._is_embedded_editor_widget(pw):
            return True
        app = None
        try:
            app = QApplication.instance()
        except Exception:
            app = None
        if app is not None:
            fw = None
            try:
                fw = app.focusWidget()
            except Exception:
                fw = None
            if self._is_embedded_editor_widget(fw):
                return True
        return False

    def _style_embedded_qmenu_instance(self, menu) -> None:
        if menu is None:
            return
        if not self._is_embedded_editor_qmenu(menu):
            return
        try:
            menu.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        except Exception:
            pass
        try:
            menu.setWindowOpacity(1.0)
        except Exception:
            pass
        try:
            menu.setStyleSheet(self._embedded_editor_qmenu_qss())
        except Exception:
            pass
        try:
            menu.update()
        except Exception:
            pass

    def _install_embedded_qmenu_style_filter(self) -> None:
        if getattr(self, "_embedded_qmenu_style_filter", None) is not None:
            return
        app = None
        try:
            app = QApplication.instance()
        except Exception:
            app = None
        if app is None:
            try:
                app = getattr(mw, "app", None)
            except Exception:
                app = None
        if app is None:
            return
        try:
            flt = _EmbeddedMenuStyleFilter(self)
            app.installEventFilter(flt)
            self._embedded_qmenu_style_filter = flt
        except Exception:
            self._embedded_qmenu_style_filter = None

    def _remove_embedded_qmenu_style_filter(self) -> None:
        flt = getattr(self, "_embedded_qmenu_style_filter", None)
        if flt is None:
            return
        app = None
        try:
            app = QApplication.instance()
        except Exception:
            app = None
        if app is None:
            try:
                app = getattr(mw, "app", None)
            except Exception:
                app = None
        if app is not None:
            try:
                app.removeEventFilter(flt)
            except Exception:
                pass
        self._embedded_qmenu_style_filter = None

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

    def _split_css_top_level(self, raw: str, sep: str = ",") -> list[str]:
        out: list[str] = []
        cur: list[str] = []
        depth = 0
        for ch in str(raw or ""):
            if ch == "(":
                depth += 1
                cur.append(ch)
                continue
            if ch == ")":
                depth = max(0, depth - 1)
                cur.append(ch)
                continue
            if ch == sep and depth == 0:
                token = "".join(cur).strip()
                if token:
                    out.append(token)
                cur = []
                continue
            cur.append(ch)
        tail = "".join(cur).strip()
        if tail:
            out.append(tail)
        return out

    def _clamp01(self, value: float) -> float:
        if value < 0.0:
            return 0.0
        if value > 1.0:
            return 1.0
        return value

    def _parse_css_alpha_value(self, token: str) -> float | None:
        s = str(token or "").strip().lower()
        if not s:
            return None
        try:
            if s.endswith("%"):
                return self._clamp01(float(s[:-1].strip()) / 100.0)
            val = float(s)
            if val > 1.0:
                val = val / 255.0
            return self._clamp01(val)
        except Exception:
            return None

    def _parse_css_rgb_channel(self, token: str) -> float | None:
        s = str(token or "").strip().lower()
        if not s:
            return None
        try:
            if s.endswith("%"):
                return self._clamp01(float(s[:-1].strip()) / 100.0)
            return self._clamp01(float(s) / 255.0)
        except Exception:
            return None

    def _parse_css_hex_color(self, value: str) -> tuple[float, float, float, float] | None:
        s = str(value or "").strip()
        if not s.startswith("#"):
            return None
        hexv = s[1:]
        try:
            if len(hexv) == 3:
                r = int(hexv[0] * 2, 16)
                g = int(hexv[1] * 2, 16)
                b = int(hexv[2] * 2, 16)
                a = 255
            elif len(hexv) == 4:
                r = int(hexv[0] * 2, 16)
                g = int(hexv[1] * 2, 16)
                b = int(hexv[2] * 2, 16)
                a = int(hexv[3] * 2, 16)
            elif len(hexv) == 6:
                r = int(hexv[0:2], 16)
                g = int(hexv[2:4], 16)
                b = int(hexv[4:6], 16)
                a = 255
            elif len(hexv) == 8:
                # CSS 8-digit hex is #RRGGBBAA.
                r = int(hexv[0:2], 16)
                g = int(hexv[2:4], 16)
                b = int(hexv[4:6], 16)
                a = int(hexv[6:8], 16)
            else:
                return None
        except Exception:
            return None
        return (r / 255.0, g / 255.0, b / 255.0, a / 255.0)

    def _parse_css_rgb_function(self, value: str) -> tuple[float, float, float, float] | None:
        m = re.match(r"^\s*rgba?\((.*)\)\s*$", str(value or ""), flags=re.IGNORECASE | re.DOTALL)
        if not m:
            return None
        body = str(m.group(1) or "").strip()
        alpha = 1.0
        if "/" in body:
            parts_raw, alpha_raw = body.rsplit("/", 1)
            body = parts_raw.strip()
            parsed_alpha = self._parse_css_alpha_value(alpha_raw)
            if parsed_alpha is None:
                return None
            alpha = parsed_alpha
        if "," in body:
            parts = [p.strip() for p in body.split(",") if p.strip()]
        else:
            parts = [p.strip() for p in re.split(r"\s+", body) if p.strip()]
        if len(parts) not in {3, 4}:
            return None
        if len(parts) == 4:
            parsed_alpha = self._parse_css_alpha_value(parts[3])
            if parsed_alpha is None:
                return None
            alpha = parsed_alpha
        r = self._parse_css_rgb_channel(parts[0])
        g = self._parse_css_rgb_channel(parts[1])
        b = self._parse_css_rgb_channel(parts[2])
        if r is None or g is None or b is None:
            return None
        return (r, g, b, alpha)

    def _parse_css_oklch(self, value: str) -> tuple[float, float, float, float] | None:
        m = re.match(r"^\s*oklch\((.*)\)\s*$", str(value or ""), flags=re.IGNORECASE | re.DOTALL)
        if not m:
            return None
        body = str(m.group(1) or "").strip()
        alpha = 1.0
        if "/" in body:
            main_raw, alpha_raw = body.rsplit("/", 1)
            body = main_raw.strip()
            parsed_alpha = self._parse_css_alpha_value(alpha_raw)
            if parsed_alpha is None:
                return None
            alpha = parsed_alpha
        parts = [p.strip() for p in re.split(r"\s+", body) if p.strip()]
        if len(parts) < 3:
            return None
        l_raw = str(parts[0]).lower()
        c_raw = str(parts[1]).lower()
        h_raw = str(parts[2]).lower().removesuffix("deg")
        try:
            if l_raw.endswith("%"):
                l = float(l_raw[:-1].strip()) / 100.0
            else:
                l = float(l_raw)
                if l > 1.0:
                    l = l / 100.0
            if c_raw.endswith("%"):
                c = float(c_raw[:-1].strip()) / 100.0
            else:
                c = float(c_raw)
            h = float(h_raw)
        except Exception:
            return None

        a = c * math.cos(math.radians(h))
        b = c * math.sin(math.radians(h))
        l_ = l + 0.3963377774 * a + 0.2158037573 * b
        m_ = l - 0.1055613458 * a - 0.0638541728 * b
        s_ = l - 0.0894841775 * a - 1.2914855480 * b
        l3 = l_ * l_ * l_
        m3 = m_ * m_ * m_
        s3 = s_ * s_ * s_
        r_lin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
        g_lin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
        b_lin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

        def _lin_to_srgb(v: float) -> float:
            if v <= 0.0:
                return 0.0
            if v <= 0.0031308:
                return self._clamp01(12.92 * v)
            return self._clamp01(1.055 * (v ** (1.0 / 2.4)) - 0.055)

        return (_lin_to_srgb(r_lin), _lin_to_srgb(g_lin), _lin_to_srgb(b_lin), self._clamp01(alpha))

    def _css_color_to_rgba(self, value: str) -> tuple[float, float, float, float] | None:
        s = str(value or "").strip()
        if not s:
            return None
        if s.lower() == "transparent":
            return (0.0, 0.0, 0.0, 0.0)
        return self._parse_css_hex_color(s) or self._parse_css_rgb_function(s) or self._parse_css_oklch(s)

    def _rgba_to_qt_color(self, rgba: tuple[float, float, float, float]) -> str:
        r, g, b, a = rgba
        rb = int(round(self._clamp01(r) * 255.0))
        gb = int(round(self._clamp01(g) * 255.0))
        bb = int(round(self._clamp01(b) * 255.0))
        ab = int(round(self._clamp01(a) * 255.0))
        if ab >= 255:
            return f"#{rb:02x}{gb:02x}{bb:02x}"
        return f"rgba({rb}, {gb}, {bb}, {ab})"

    def _parse_color_mix_part(self, value: str) -> tuple[str, float | None]:
        s = str(value or "").strip()
        m = re.match(r"^(.*)\s+([0-9]*\.?[0-9]+)%\s*$", s, flags=re.DOTALL)
        if not m:
            return s, None
        expr = str(m.group(1) or "").strip()
        try:
            weight = float(str(m.group(2) or "").strip()) / 100.0
        except Exception:
            weight = None
        return expr, weight

    def _resolve_color_mix_to_qt(self, value: str, resolve_fn, depth: int) -> str | None:
        m = re.match(r"^\s*color-mix\((.*)\)\s*$", str(value or ""), flags=re.IGNORECASE | re.DOTALL)
        if not m:
            return None
        body = str(m.group(1) or "").strip()
        mode = re.match(r"^\s*in\s+srgb\s*,(.*)\s*$", body, flags=re.IGNORECASE | re.DOTALL)
        if not mode:
            return None
        parts = self._split_css_top_level(str(mode.group(1) or "").strip(), ",")
        if len(parts) < 2:
            return None
        first_expr, first_w = self._parse_color_mix_part(parts[0])
        second_expr, second_w = self._parse_color_mix_part(parts[1])
        c1 = self._css_color_to_rgba(resolve_fn(first_expr, depth + 1))
        c2 = self._css_color_to_rgba(resolve_fn(second_expr, depth + 1))
        if c1 is None or c2 is None:
            return None
        if first_w is None and second_w is None:
            first_w, second_w = 0.5, 0.5
        elif first_w is None:
            first_w = max(0.0, 1.0 - float(second_w or 0.0))
        elif second_w is None:
            second_w = max(0.0, 1.0 - float(first_w or 0.0))
        total = float(first_w or 0.0) + float(second_w or 0.0)
        if total <= 0.0:
            return None
        w1 = float(first_w or 0.0) / total
        w2 = float(second_w or 0.0) / total
        mixed = (
            c1[0] * w1 + c2[0] * w2,
            c1[1] * w1 + c2[1] * w2,
            c1[2] * w1 + c2[2] * w2,
            c1[3] * w1 + c2[3] * w2,
        )
        return self._rgba_to_qt_color(mixed)

    def _resolve_embedded_css_value(self, value: str) -> str:
        vars_map = self._get_embedded_editor_css_vars()

        def _resolve(v: str, depth: int = 0) -> str:
            if depth > 16:
                return str(v or "").strip()
            s = str(v or "").strip()
            m = re.search(r"var\((--[a-zA-Z0-9_-]+)\)", s)
            while m and depth <= 16:
                key = str(m.group(1) or "").strip()
                rep = vars_map.get(key, "")
                if not rep:
                    break
                s = s.replace(str(m.group(0) or ""), rep, 1)
                depth += 1
                m = re.search(r"var\((--[a-zA-Z0-9_-]+)\)", s)
            mixed = self._resolve_color_mix_to_qt(s, _resolve, depth)
            if mixed:
                return mixed
            rgba = self._css_color_to_rgba(s)
            if rgba is not None:
                return self._rgba_to_qt_color(rgba)
            if "color-mix(" in s:
                # Last fallback when a mix expression cannot be parsed.
                return vars_map.get("--bg-chip-100", vars_map.get("--ui-surface-card", "#3e4350"))
            return s

        return _resolve(str(value or "").strip())

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
        self._apply_embedded_editor_webview_base_style()
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

    def _apply_embedded_editor_webview_base_style(self) -> None:
        # Transparent baseline for webviews/pages before/while theme CSS is applied.
        editor = self._embedded_editor
        if editor is None:
            return
        color = "transparent"
        qcolor = QColor(0, 0, 0, 0)
        menu_qss = self._embedded_editor_qmenu_qss()
        for attr in ("web", "toolbarWeb"):
            wv = None
            try:
                wv = getattr(editor, attr, None)
            except Exception:
                wv = None
            if wv is None:
                continue
            try:
                wv.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
            except Exception:
                pass
            try:
                wv.setStyleSheet(f"background: {color};" + menu_qss)
            except Exception:
                pass
            page = None
            try:
                page = wv.page()
            except Exception:
                page = None
            if page is None:
                continue
            try:
                page.setBackgroundColor(qcolor)
            except Exception:
                pass
            try:
                wv.eval(
                    r"""
// js
(function(){
try{
var c='transparent';
if(document&&document.documentElement){
 document.documentElement.style.setProperty('background', c, 'important');
 document.documentElement.style.setProperty('background-color', c, 'important');
}
if(document&&document.body){
 document.body.style.setProperty('background', c, 'important');
 document.body.style.setProperty('background-color', c, 'important');
}
var sid='ajpc-embed-base-transparent-style';
var st=document.getElementById(sid);
if(!st){st=document.createElement('style');st.id=sid;document.head.appendChild(st);}
st.textContent='html,body{background:'+c+' !important;background-color:'+c+' !important;}';
}catch(_e){}
})();
// !js
"""
                )
            except Exception:
                pass

    def _trigger_embedded_editor_tag_wrap(self) -> None:
        editor = self._embedded_editor
        if editor is None:
            return
        js = r"""
// js
(function(){
try{
 if(window&&typeof window.__ajpcForceTagWrap==='function'){window.__ajpcForceTagWrap();}
}catch(_e){}
})();
// !js
"""

        def _run_once() -> None:
            for attr in ("web", "toolbarWeb"):
                wv = None
                try:
                    wv = getattr(editor, attr, None)
                except Exception:
                    wv = None
                if wv is None:
                    continue
                try:
                    wv.eval(js)
                except Exception:
                    continue

        _run_once()
        try:
            QTimer.singleShot(80, _run_once)
            QTimer.singleShot(220, _run_once)
        except Exception:
            pass

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
            self._hard_set_embedded_editor_transparent_background()
            self._embedded_editor.set_note(note, focusTo=focus_to)
            self._show_embedded_editor_widgets()
            # Enforce transparent baseline again after deferred note mount.
            self._hard_set_embedded_editor_transparent_background()
            self._theme_embedded_editor_web()
            self._trigger_embedded_editor_tag_wrap()
            logger.dbg("embedded editor deferred set_note", target_nid)
        except Exception as exc:
            logger.dbg("embedded editor deferred set_note failed", target_nid, repr(exc))

    def _sync_web_editor_panel_visibility(self, visible: bool) -> None:
        # Keep the web sidebar state in sync when the native editor closes itself
        # (e.g. the embedded Anki "Close" button in the editor form).
        try:
            open_js = "true" if bool(visible) else "false"
            js = r"""
// js
(function(){
try{
var open=__OPEN__;
if(typeof window.updateEditorVisibility==='function'){window.updateEditorVisibility(open);return;}
var panel=document.getElementById('editor-panel');
if(!panel) return;
panel.classList.toggle('closed', !open);
panel.setAttribute('aria-hidden', open ? 'false' : 'true');
}catch(_e){}
})();
// !js
""".replace("__OPEN__", open_js)
            self.web.eval(js)
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
            panel = self._editor_panel
            already_open = bool(self._editor_panel_open) and not bool(self._editor_panel_closing)
            if panel is not None:
                try:
                    already_open = already_open and bool(panel.isVisible())
                except Exception:
                    pass
            self._embedded_editor_nid = nid
            self._editor_panel_open = True
            self._editor_panel_closing = False
            self._hard_set_embedded_editor_transparent_background()
            if not bool(self._editor_panel_rect.get("visible")):
                host_w = max(1, int(self.width()))
                host_h = max(1, int(self.height()))
                fallback_w = max(360, min(720, int(host_w * 0.42)))
                self._editor_panel_rect = {"visible": True, "x": 0, "y": 0, "w": fallback_w, "h": host_h}
            if already_open:
                self._update_embedded_editor_geometry()
            else:
                self._animate_embedded_editor_panel(True)
            self._show_embedded_editor_widgets()
            self._hard_set_embedded_editor_transparent_background()
            self._embedded_editor.set_note(note, focusTo=focus_to)
            self._hard_set_embedded_editor_transparent_background()
            self._theme_embedded_editor_web()
            self._trigger_embedded_editor_tag_wrap()
            QTimer.singleShot(0, lambda n=nid, f=focus_to: self._deferred_set_embedded_editor_note(n, f))
            QTimer.singleShot(120, lambda n=nid, f=focus_to: self._deferred_set_embedded_editor_note(n, f))
            logger.dbg("embedded editor show", nid)
            return True
        except Exception as exc:
            logger.dbg("embedded editor show failed", nid, repr(exc))
            return False

    def _preload_embedded_editor_webview(self) -> None:
        # Fallback preload: build the editor/webview pipeline once at window startup
        # but keep the panel hidden until explicitly opened by the user.
        if bool(getattr(self, "_embedded_editor_preload_done", False)):
            return
        if mw is None or getattr(mw, "col", None) is None:
            return
        try:
            if not self._ensure_embedded_editor():
                return
            self._embedded_editor_preload_done = True
            self._editor_panel_open = False
            try:
                if self._editor_panel is not None:
                    self._editor_panel.hide()
            except Exception:
                pass
            try:
                self._sync_web_editor_panel_visibility(False)
            except Exception:
                pass
            self._hard_set_embedded_editor_transparent_background()
            logger.dbg("embedded editor preloaded")
        except Exception as exc:
            logger.dbg("embedded editor preload failed", repr(exc))

    def _hide_embedded_editor_panel(self) -> None:
        panel = self._editor_panel
        already_closed = (not bool(self._editor_panel_open)) and (not bool(self._editor_panel_closing))
        if panel is not None:
            try:
                already_closed = already_closed and (not bool(panel.isVisible()))
            except Exception:
                pass
        # Start web-side CSS close immediately so it can run in parallel with
        # the native Qt slide-out, instead of waiting for any animation callbacks.
        self._sync_web_editor_panel_visibility(False)
        self._editor_panel_open = False
        self._hard_set_embedded_editor_transparent_background()
        try:
            self._editor_panel_rect = {
                "visible": False,
                "x": int(self._editor_panel_rect.get("x", 0) or 0),
                "y": int(self._editor_panel_rect.get("y", 0) or 0),
                "w": int(self._editor_panel_rect.get("w", 0) or 0),
                "h": int(self._editor_panel_rect.get("h", 0) or 0),
                "vw": max(0, int(self.width() or 0)),
                "vh": max(0, int(self.height() or 0)),
            }
        except Exception:
            self._editor_panel_rect = {"visible": False, "x": 0, "y": 0, "w": 0, "h": 0, "vw": 0, "vh": 0}
        if already_closed:
            self._editor_panel_closing = False
            try:
                if panel is not None:
                    panel.hide()
            except Exception:
                pass
        else:
            self._animate_embedded_editor_panel(False)
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
        self._remove_embedded_qmenu_style_filter()
        self._stop_embedded_editor_animation()
        self._editor_panel_closing = False
        self._editor_panel_open = False
        try:
            self._editor_panel_rect = {
                "visible": False,
                "x": 0,
                "y": 0,
                "w": 0,
                "h": 0,
                "vw": max(0, int(self.width() or 0)),
                "vh": max(0, int(self.height() or 0)),
            }
        except Exception:
            self._editor_panel_rect = {"visible": False, "x": 0, "y": 0, "w": 0, "h": 0, "vw": 0, "vh": 0}
        try:
            if self._editor_panel is not None:
                self._editor_panel.hide()
        except Exception:
            pass
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
        if self._embedded_editor_root is not None:
            try:
                self._editor_mount_layout.removeWidget(self._embedded_editor_root)
            except Exception:
                pass
            try:
                self._embedded_editor_root.hide()
            except Exception:
                pass
            try:
                self._embedded_editor_root.setParent(None)
            except Exception:
                pass
            try:
                self._embedded_editor_root.deleteLater()
            except Exception:
                pass
        self._embedded_editor = None
        self._embedded_editor_form = None
        self._embedded_editor_root = None
        self._embedded_editor_preload_done = False
        try:
            if self._editor_hint is not None:
                self._editor_hint.setVisible(True)
        except Exception:
            pass
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

    def _reload_embedded_editor_css(self) -> None:
        # Force re-read from compiled graph.css and re-apply to embedded editor webviews.
        self._embedded_editor_theme_css = ""
        self._embedded_editor_theme_css_mtime = 0.0
        try:
            self._apply_embedded_editor_panel_style()
        except Exception:
            pass
        try:
            self._theme_embedded_editor_web()
        except Exception:
            pass
        logger.dbg("embedded editor css reload")
