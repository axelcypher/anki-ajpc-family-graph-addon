"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const errors = [];
const notes = [];

function readText(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function fail(msg) {
  errors.push(msg);
}

function note(msg) {
  notes.push(msg);
}

function mustContain(src, pattern, label) {
  if (!pattern.test(src)) fail("Missing expected pattern: " + label);
}

function mustNotContain(src, pattern, label) {
  if (pattern.test(src)) fail("Forbidden pattern present: " + label);
}

function extractFunctionBlock(src, fnRegex) {
  const m = fnRegex.exec(src);
  if (!m) return "";
  return String(m[0]);
}

function checkEntrypointsAndUsecases() {
  const bootstrap = readText("web/core/application/usecases/city/graph.city.usecase.bootstrap.js");
  const payloadApply = readText("web/core/application/usecases/city/graph.city.usecase.payload.apply.js");
  const deltaApply = readText("web/core/application/usecases/city/graph.city.usecase.delta.apply.js");

  mustContain(bootstrap, /window\.ajpcGraphInit\s*=\s*function[\s\S]*?cityUsecaseBoot\(/m, "ajpcGraphInit -> cityUsecaseBoot");
  mustContain(bootstrap, /window\.ajpcGraphUpdate\s*=\s*function[\s\S]*?cityUsecaseBoot\(/m, "ajpcGraphUpdate -> cityUsecaseBoot");
  mustContain(bootstrap, /window\.ajpcGraphDelta\s*=\s*function[\s\S]*?cityUsecaseApplyDeltaPayload\(/m, "ajpcGraphDelta -> cityUsecaseApplyDeltaPayload");

  mustContain(payloadApply, /cityUsecaseResolveApplyGraphData\(/m, "payload apply resolves applyGraphData port");
  mustContain(payloadApply, /applyFn\(\!\!fitView\)/m, "payload apply invokes applyGraphData port");

  mustContain(deltaApply, /applyDeltaOpsFn\(ops,\s*arrays,\s*\{\s*preserve_layout:\s*true\s*\}\)/m, "delta apply uses preserve_layout patch");
  mustContain(deltaApply, /applyRuntimeUiSettings\(false\)/m, "delta apply disables solver restart in runtime-ui apply");
  mustContain(deltaApply, /var\s+hasEdgeDelta\s*=\s*counts\.edge_upsert\s*>\s*0\s*\|\|\s*counts\.edge_drop\s*>\s*0/m, "delta edge change detection");
  mustContain(deltaApply, /cityUsecaseHasEnginePort\(\"runSubsetNoDampingPull\"\)/m, "delta subset pull checks explicit port");
  mustContain(deltaApply, /cityUsecaseCallEngineMethod\(\"runSubsetNoDampingPull\",\s*subsetNodeIds,\s*\{\s*include_links:\s*true,\s*ticks:\s*18,\s*animate:\s*true\s*\}\)/m, "delta subset pull calls engine port with animated ticks");
  mustNotContain(deltaApply, /cityUsecaseCallEngineMethod\(\"reheat\"/m, "delta path must not call reheat()");
  mustNotContain(deltaApply, /cityUsecaseCallEngineMethod\(\"start\"/m, "delta path must not call start()");
  mustNotContain(deltaApply, /cityUsecaseCallEngine\(\"applyGraphData\"/m, "delta path must not call full applyGraphData directly");

  note("entrypoint/usecase checks passed");
}

function checkEngineDeltaAndReheatBridge() {
  const engineMain = readText("web/adapters/engine/runtime/graph.engine.main.js");
  const applyDeltaBlock = extractFunctionBlock(
    engineMain,
    /function\s+applyGraphDeltaOps\s*\([\s\S]*?\n\}/m
  );
  if (!applyDeltaBlock) {
    fail("Could not extract applyGraphDeltaOps block from graph.engine.main.js");
  } else {
    mustNotContain(applyDeltaBlock, /setConfig\(/m, "engine delta apply must not call setConfig()");
    mustNotContain(applyDeltaBlock, /\.start\(/m, "engine delta apply must not call start()");
    mustContain(applyDeltaBlock, /STATE\.graph\.applyDeltaOps\(/m, "engine delta apply patches via graph.applyDeltaOps");
  }

  mustContain(
    engineMain,
    /SigmaGraphCompat\.prototype\.reheat\s*=\s*function\s*\(alpha\)\s*\{[\s\S]*?this\.solver\.reheat\(alpha\);[\s\S]*?\}/m,
    "SigmaGraphCompat.reheat delegates to solver.reheat"
  );
  mustContain(engineMain, /"reheat"/m, "engine method fallback list contains reheat");

  note("engine delta/reheat bridge checks passed");
}

function checkSolverReheatBehavior() {
  const solver = readText("web/adapters/engine/solver/graph.engine.solver.d3.js");
  const reheatBlock = extractFunctionBlock(
    solver,
    /AjpcGraphSolverD3\.prototype\.reheat\s*=\s*function\s*\(alpha\)\s*\{[\s\S]*?\n\};/m
  );
  if (!reheatBlock) {
    fail("Could not extract AjpcGraphSolverD3.reheat block");
    return;
  }

  mustContain(reheatBlock, /layout disabled/m, "solver reheat logs skip when layout disabled");
  mustContain(reheatBlock, /simulation missing/m, "solver reheat logs skip when simulation missing");
  mustContain(reheatBlock, /this\.simulation\.alpha\(/m, "solver reheat sets alpha");
  mustContain(reheatBlock, /this\.simulation\.alphaTarget\(/m, "solver reheat sets alphaTarget");
  mustContain(reheatBlock, /this\.simulation\.restart\(\)/m, "solver reheat restarts simulation");

  mustNotContain(reheatBlock, /this\.stop\s*\(\s*true\s*\)/m, "solver reheat must not rebuild via stop(true)");
  mustNotContain(reheatBlock, /_buildSimulation\s*\(/m, "solver reheat must not rebuild simulation model");
  mustNotContain(reheatBlock, /d3_warmup_ticks/m, "solver reheat must not depend on warmup ticks");

  note("solver reheat checks passed");
}

function main() {
  checkEntrypointsAndUsecases();
  checkEngineDeltaAndReheatBridge();
  checkSolverReheatBehavior();

  if (errors.length) {
    console.error("FAIL check_frontend_delta_reheat_pipeline");
    errors.forEach((e) => console.error("- " + e));
    process.exit(1);
  }

  console.log("OK check_frontend_delta_reheat_pipeline");
  notes.forEach((n) => console.log("- " + n));
}

main();
