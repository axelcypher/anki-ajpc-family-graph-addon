"use strict";

function cityUsecaseGateway() {
  var gw = window && window.AjpcCityGateway;
  return (gw && typeof gw === "object") ? gw : null;
}

function cityUsecaseCallEngine(name) {
  var gw = cityUsecaseGateway();
  if (!gw || typeof gw.callEngine !== "function") return undefined;
  return gw.callEngine.apply(gw, arguments);
}

function cityUsecaseHasEnginePort(name) {
  var gw = cityUsecaseGateway();
  return !!(gw && typeof gw.hasEnginePort === "function" && gw.hasEnginePort(name));
}

function cityUsecaseCallEngineMethod(methodName) {
  var gw = cityUsecaseGateway();
  if (gw && typeof gw.callEngineGraph === "function") {
    return gw.callEngineGraph.apply(gw, arguments);
  }
  var args = Array.prototype.slice.call(arguments, 1);
  args.unshift(methodName);
  return cityUsecaseCallEngine.apply(null, args);
}

function cityUsecaseResolveApplyGraphData() {
  if (!cityUsecaseHasEnginePort("applyGraphData")) return null;
  return function (fitView) {
    return cityUsecaseCallEngine("applyGraphData", fitView);
  };
}

function cityUsecaseResolveApplyGraphDeltaOps() {
  if (!cityUsecaseHasEnginePort("applyGraphDeltaOps")) return null;
  return function (ops, arrays, options) {
    return cityUsecaseCallEngine("applyGraphDeltaOps", ops, arrays, options);
  };
}

function cityUsecaseResolveApplyVisualStyles() {
  if (!cityUsecaseHasEnginePort("applyVisualStyles")) return null;
  return function (renderAlpha) {
    return cityUsecaseCallEngine("applyVisualStyles", renderAlpha);
  };
}
