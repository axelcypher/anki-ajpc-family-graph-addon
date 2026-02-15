"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const errors = [];
const notes = [];

function relPath(p) {
  return p.split(path.sep).join("/");
}

function readText(rel) {
  const abs = path.join(repoRoot, rel);
  return fs.readFileSync(abs, "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(repoRoot, rel));
}

function fail(msg) {
  errors.push(msg);
}

function note(msg) {
  notes.push(msg);
}

function extractRegisteredPorts(src, registerFnName) {
  const re = new RegExp(registerFnName + "\\(\\s*\"([^\"]+)\"", "g");
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(String(m[1]));
  return Array.from(new Set(out));
}

function extractRegHelperNames(src) {
  const re = /\breg\(\s*"([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(String(m[1]));
  return Array.from(new Set(out));
}

function extractFallbackMethodNames(engineMainSrc) {
  const re = /var\s+ENGINE_GRAPH_METHOD_FALLBACK_NAMES\s*=\s*Object\.freeze\(\s*\[([\s\S]*?)\]\s*\)\s*;/m;
  const m = re.exec(engineMainSrc);
  if (!m) return [];
  const body = String(m[1] || "");
  const q = /"([^"]+)"/g;
  const out = [];
  let t;
  while ((t = q.exec(body)) !== null) out.push(String(t[1]));
  return Array.from(new Set(out));
}

function loadContracts() {
  const contractsSrc = readText("web/core/contracts/graph.contracts.js");
  const sandbox = { window: {} };
  vm.runInNewContext(contractsSrc, sandbox, {
    filename: "web/core/contracts/graph.contracts.js"
  });
  const contracts = sandbox.window.AjpcGraphContracts;
  if (!contracts) {
    fail("AjpcGraphContracts not exported by web/core/contracts/graph.contracts.js");
    return null;
  }
  if (typeof contracts.listCityPortContracts !== "function") fail("AjpcGraphContracts.listCityPortContracts missing");
  if (typeof contracts.listEnginePortContracts !== "function") fail("AjpcGraphContracts.listEnginePortContracts missing");
  if (typeof contracts.listEngineGraphMethodContracts !== "function") fail("AjpcGraphContracts.listEngineGraphMethodContracts missing");
  return contracts;
}

function checkPortContracts() {
  const contracts = loadContracts();
  if (!contracts) return;

  const cityContracts = contracts.listCityPortContracts() || {};
  const engineContracts = contracts.listEnginePortContracts() || {};
  const graphMethodContracts = contracts.listEngineGraphMethodContracts() || {};

  const cityFiles = [
    "web/adapters/city/payload/graph.city.payload.js",
    "web/adapters/city/ui/graph.city.ui.js",
    "web/adapters/city/flow/graph.city.flow.js",
    "web/adapters/city/utils/graph.city.utils.js"
  ];
  const cityRegistered = Array.from(new Set(cityFiles.flatMap((f) => {
    const src = readText(f);
    return extractRegisteredPorts(src, "registerCityPortWithContract").concat(extractRegHelperNames(src));
  })));
  cityRegistered.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(cityContracts, name)) {
      fail("Missing city contract for registered port: " + name);
    }
  });

  const engineMainRel = "web/adapters/engine/runtime/graph.engine.main.js";
  const engineMainSrc = readText(engineMainRel);
  const engineRegistered = extractRegisteredPorts(engineMainSrc, "registerEnginePortWithContract");
  engineRegistered.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(engineContracts, name)) {
      fail("Missing engine contract for registered port: " + name);
    }
  });

  const fallbackMethods = extractFallbackMethodNames(engineMainSrc);
  if (!fallbackMethods.length) fail("ENGINE_GRAPH_METHOD_FALLBACK_NAMES not found or empty");
  fallbackMethods.forEach((name) => {
    if (!Object.prototype.hasOwnProperty.call(graphMethodContracts, name)) {
      fail("Missing engine graph method contract for fallback method: " + name);
    }
  });

  note("city ports registered: " + cityRegistered.length);
  note("engine ports registered: " + engineRegistered.length);
  note("engine graph methods in fallback list: " + fallbackMethods.length);
}

function checkHtmlAssetsOrder() {
  const html = readText("web/graph.html");
  const requiredInOrder = [
    "__GRAPH_ADAPTER_JS__",
    "__GRAPH_CITY_GATEWAY_JS__",
    "__GRAPH_CONTRACTS_JS__",
    "__GRAPH_UTILS_JS__",
    "__GRAPH_PAYLOAD_JS__",
    "__GRAPH_FLOW_JS__",
    "__GRAPH_ENGINE_GATEWAY_JS__",
    "__GRAPH_ENGINE_JS__"
  ];

  let prev = -1;
  requiredInOrder.forEach((ph) => {
    const idx = html.indexOf(ph);
    if (idx < 0) {
      fail("Missing placeholder in web/graph.html: " + ph);
      return;
    }
    if (idx <= prev) {
      fail("Placeholder order violation in web/graph.html around: " + ph);
      return;
    }
    prev = idx;
  });

  const assetsPy = readText("graph_web_assets.py");
  if (!/"__GRAPH_CONTRACTS_JS__"\s*:\s*asset_url\("core\/contracts\/graph\.contracts\.js"\)/.test(assetsPy)) {
    fail("graph_web_assets.py missing __GRAPH_CONTRACTS_JS__ mapping");
  }
  if (!exists("web/core/contracts/graph.contracts.js")) {
    fail("Missing file: web/core/contracts/graph.contracts.js");
  }
}

function main() {
  checkPortContracts();
  checkHtmlAssetsOrder();

  if (errors.length) {
    console.error("FAIL check_frontend_runtime_contracts");
    errors.forEach((e) => console.error("- " + e));
    process.exit(1);
  }

  console.log("OK check_frontend_runtime_contracts");
  notes.forEach((n) => console.log("- " + n));
}

main();
