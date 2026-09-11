import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { challenges } from "./index";

const python = process.env.PMC_TEST_PYTHON || "python";
const auditor = `
import contextlib, io, json, sys
cases = json.load(sys.stdin)
results = []
for case in cases:
    output = io.StringIO()
    error = None
    with contextlib.redirect_stdout(output):
        try:
            exec(compile(case["code"], "<curriculum>", "exec"), {})
        except Exception as exc:
            error = type(exc).__name__
    results.append({"id": case["id"], "output": output.getvalue(), "error": error})
print(json.dumps(results))
`;

const cases = challenges.flatMap((item) => [
  {
    id: item.id,
    code: item.code,
    output: item.expectedOutput,
    error: item.expectedException ?? null,
  },
  ...(item.repair
    ? [
        {
          id: `${item.id}:repair`,
          code: item.repair.code,
          output: item.repair.expectedOutput,
          error: null,
        },
      ]
    : []),
]);

describe("actual Python curriculum audit", () => {
  it("matches exact stdout and exception class for every original and repaired snippet", () => {
    const run = spawnSync(python, ["-I", "-c", auditor], {
      input: JSON.stringify(cases),
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 2_000_000,
    });
    expect(
      run.error,
      "CPython must be available for content verification",
    ).toBeUndefined();
    expect(run.status, run.stderr).toBe(0);
    const actual = JSON.parse(run.stdout) as {
      id: string;
      output: string;
      error: string | null;
    }[];
    expect(actual).toHaveLength(cases.length);
    for (const [index, result] of actual.entries()) {
      expect(result.output, result.id).toBe(cases[index].output);
      expect(result.error, result.id).toBe(cases[index].error);
    }
  });

  it("matches the same results through the production Python Machine helper", () => {
    const script = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("mission_runner", "python/runner.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
results = []
for case in json.load(sys.stdin):
    result = runner.run_code(case["code"])
    results.append({"id": case["id"], "output": result["output"], "error": result["error"]["type"] if result["error"] else None, "truncated": result["truncated"], "events": len(result["events"])})
print(json.dumps(results))
`;
    const run = spawnSync(python, ["-I", "-c", script], {
      input: JSON.stringify(cases),
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 2_000_000,
    });
    expect(run.error).toBeUndefined();
    expect(run.status, run.stderr).toBe(0);
    const actual = JSON.parse(run.stdout) as {
      id: string;
      output: string;
      error: string | null;
      truncated: boolean;
      events: number;
    }[];
    expect(actual).toHaveLength(cases.length);
    for (const [index, result] of actual.entries()) {
      expect(result.output, result.id).toBe(cases[index].output);
      expect(result.error, result.id).toBe(cases[index].error);
      expect(result.truncated, result.id).toBe(false);
      expect(result.events, result.id).toBeGreaterThan(0);
    }
  });

  it("uses a real CPython interpreter", () => {
    const run = spawnSync(
      python,
      ["-I", "-c", "import sys; print(sys.implementation.name)"],
      { encoding: "utf8", timeout: 5000 },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe("cpython");
  });

  it("keeps code within the declared controlled-curriculum boundary", () => {
    for (const item of challenges) {
      for (const code of [item.code, item.repair?.code].filter(
        Boolean,
      ) as string[]) {
        expect(code, item.id).not.toMatch(
          /(^|\n)\s*(import|from|class|global|nonlocal)\b/,
        );
        expect(code, item.id).not.toMatch(
          /\b(open|eval|exec|compile|input|__import__)\s*\(/,
        );
        expect(code.split("\n").length, item.id).toBeLessThanOrEqual(12);
      }
    }
  });
});
