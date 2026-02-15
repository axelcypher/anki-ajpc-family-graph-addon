"use strict";

function log(msg) {
  try {
    if (window.pycmd) {
      window.pycmd("log:" + msg);
    }
  } catch (_e) {
    // no-op
  }
}

function persistHook(command) {
  if (!STATE.persistHooksEnabled) return;
  try {
    if (window.pycmd) window.pycmd(command);
  } catch (_e) {
    // no-op
  }
}
