"use strict";
(function () {
  var root = window;
  if (!root) return;

  var cityPorts = Object.create(null);
  var enginePorts = Object.create(null);

  function asName(name) {
    return String(name || "").trim();
  }

  function invoke(store, name, args) {
    var key = asName(name);
    if (!key) return undefined;
    var fn = store[key];
    if (typeof fn !== "function") return undefined;
    try {
      return fn.apply(null, args || []);
    } catch (err) {
      try {
        if (typeof log === "function") {
          log("adapter.error: " + key + ": " + String(err && err.message ? err.message : err));
        }
      } catch (_e0) {}
      try {
        if (root && root.console && typeof root.console.error === "function") {
          root.console.error("[GraphAdapter]", key, err);
        }
      } catch (_e1) {}
      return undefined;
    }
  }

  function tailArgs(args, start) {
    return Array.prototype.slice.call(args, start || 0);
  }

  var adapter = root.GraphAdapter && typeof root.GraphAdapter === "object"
    ? root.GraphAdapter
    : {};

  adapter.registerCityPort = function (name, fn) {
    var key = asName(name);
    if (!key || typeof fn !== "function") return;
    cityPorts[key] = fn;
  };

  adapter.registerEnginePort = function (name, fn) {
    var key = asName(name);
    if (!key || typeof fn !== "function") return;
    enginePorts[key] = fn;
  };

  adapter.hasCityPort = function (name) {
    var key = asName(name);
    return !!(key && typeof cityPorts[key] === "function");
  };

  adapter.hasEnginePort = function (name) {
    var key = asName(name);
    return !!(key && typeof enginePorts[key] === "function");
  };

  adapter.callCity = function (name) {
    return invoke(cityPorts, name, tailArgs(arguments, 1));
  };

  adapter.callEngine = function (name) {
    return invoke(enginePorts, name, tailArgs(arguments, 1));
  };

  adapter.cityPorts = cityPorts;
  adapter.enginePorts = enginePorts;

  root.GraphAdapter = adapter;
})();
