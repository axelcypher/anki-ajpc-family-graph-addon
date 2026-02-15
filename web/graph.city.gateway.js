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

  function callEngineGraph(methodName) {
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift(String(methodName || ""));
    args.unshift("graphCall");
    return callEngine.apply(null, args);
  }

  function registerCityPort(name, fn) {
    var a = adapter();
    if (!a || typeof a.registerCityPort !== "function") return;
    a.registerCityPort(name, fn);
  }

  function registerCityContract(name, contract) {
    var a = adapter();
    if (!a || typeof a.registerCityContract !== "function") return;
    a.registerCityContract(name, contract);
  }

  function registerCityPortWithContract(name, fn, contract) {
    registerCityPort(name, fn);
    if (contract && typeof contract === "object") registerCityContract(name, contract);
  }

  var gateway = root.AjpcCityGateway && typeof root.AjpcCityGateway === "object"
    ? root.AjpcCityGateway
    : {};

  gateway.callCity = callCity;
  gateway.callEngine = callEngine;
  gateway.hasCityPort = hasCityPort;
  gateway.hasEnginePort = hasEnginePort;
  gateway.callEngineGraph = callEngineGraph;
  gateway.registerCityPort = registerCityPort;
  gateway.registerCityContract = registerCityContract;
  gateway.registerCityPortWithContract = registerCityPortWithContract;

  root.AjpcCityGateway = gateway;
})();
