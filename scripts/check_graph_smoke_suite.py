from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def run_cmd(cmd: list[str]) -> None:
    proc = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        text=True,
        capture_output=True,
    )
    if proc.stdout:
        sys.stdout.write(proc.stdout)
    if proc.stderr:
        sys.stderr.write(proc.stderr)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def read_text(rel_path: str) -> str:
    return (REPO_ROOT / rel_path).read_text(encoding="utf-8")


def require(pattern: str, text: str, label: str) -> None:
    if not re.search(pattern, text, re.MULTILINE | re.DOTALL):
        raise SystemExit(f"FAIL backend guard: missing {label}")


def forbid(pattern: str, text: str, label: str) -> None:
    if re.search(pattern, text, re.MULTILINE | re.DOTALL):
        raise SystemExit(f"FAIL backend guard: forbidden {label}")


def backend_delta_guards() -> None:
    src = read_text("graph_data.py")

    fn_match = re.search(
        r"def\s+build_note_delta_slice\s*\([\s\S]*?(?=^def\s+|\Z)",
        src,
        re.MULTILINE,
    )
    if not fn_match:
        raise SystemExit("FAIL backend guard: build_note_delta_slice function missing")
    fn = fn_match.group(0)

    require(r"recursive_neighbor_expand\s*=\s*False", fn, "recursive_neighbor_expand=False")
    require(r"\bif\s+recursive_neighbor_expand\s*:", fn, "recursive guard branches")
    forbid(r"recursive_neighbor_expand\s*=\s*True", fn, "recursive_neighbor_expand=True assignment")
    require(r"logger\.dbg\([\s\S]*\"recursive=\"", fn, "delta slice recursive logging")

    print("OK backend delta guards")


def main() -> None:
    print("Running frontend contract/runtime checks...")
    run_cmd(["node", "scripts/check_frontend_runtime_contracts.js"])

    print("Running frontend delta/reheat pipeline checks...")
    run_cmd(["node", "scripts/check_frontend_delta_reheat_pipeline.js"])

    print("Running backend delta guards...")
    backend_delta_guards()

    print("OK graph smoke suite")


if __name__ == "__main__":
    main()
