"use strict";
(function () {
  var root = window;
  if (!root) return;

  function adapter() {
    var a = root.GraphAdapter;
    return (a && typeof a === "object") ? a : null;
  }

  function callCity(name) {
    var a = adapter();
    if (!a || typeof a.callCity !== "function") return undefined;
    return a.callCity.apply(a, arguments);
  }

  function callEngine(name) {
    var a = adapter();
    if (!a || typeof a.callEngine !== "function") return undefined;
    return a.callEngine.apply(a, arguments);
  }

  function hasCityPort(name) {
    var a = adapter();
    return !!(a && typeof a.hasCityPort === "function" && a.hasCityPort(name));
  }

  function hasEnginePort(name) {
    var a = adapter();
    return !!(a && typeof a.hasEnginePort === "function" && a.hasEnginePort(name));
  }

  function registerEnginePort(name, fn) {
    var a = adapter();
    if (!a || typeof a.registerEnginePort !== "function") return;
    a.registerEnginePort(name, fn);
  }

  function registerEngineContract(name, contract) {
    var a = adapter();
    if (!a || typeof a.registerEngineContract !== "function") return;
    a.registerEngineContract(name, contract);
  }

  function registerEnginePortWithContract(name, fn, contract) {
    registerEnginePort(name, fn);
    if (contract && typeof contract === "object") registerEngineContract(name, contract);
  }

  var gateway = root.AjpcEngineGateway && typeof root.AjpcEngineGateway === "object"
    ? root.AjpcEngineGateway
    : {};

  gateway.callCity = callCity;
  gateway.callEngine = callEngine;
  gateway.hasCityPort = hasCityPort;
  gateway.hasEnginePort = hasEnginePort;
  gateway.registerEnginePort = registerEnginePort;
  gateway.registerEngineContract = registerEngineContract;
  gateway.registerEnginePortWithContract = registerEnginePortWithContract;

  root.AjpcEngineGateway = gateway;
})();
