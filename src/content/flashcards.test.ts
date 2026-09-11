import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { challenges } from "./index";
import { flashcards, validateFlashcards } from "./flashcards";

describe("flashcard content contract", () => {
  it("ships a substantial, linked starter bank", () => {
    expect(flashcards.length).toBeGreaterThanOrEqual(60);
    expect(validateFlashcards(flashcards, challenges.map((item) => item.id))).toEqual([]);
    expect(new Set(flashcards.map((card) => card.id)).size).toBe(flashcards.length);
    expect(new Set(flashcards.map((card) => card.topic))).toEqual(
      new Set([
        "variables",
        "strings",
        "conditionals",
        "collections",
        "loops",
        "functions",
        "exceptions",
        "other",
      ]),
    );
    expect(new Set(flashcards.map((card) => card.type))).toEqual(
      new Set(["concept", "code"]),
    );
  });

  it("reports malformed cards without throwing", () => {
    const errors = validateFlashcards([
      null,
      { id: "broken", topic: "variables", type: "unknown" },
    ]);
    expect(errors.join("\n")).toMatch(/must be an object|invalid type|missing front/);
  });

  it("keeps every code-reading answer aligned with CPython", () => {
    const cases = flashcards
      .filter((card) => card.type === "code")
      .map((card) => ({ id: card.id, code: card.code, output: card.output }));
    const audit = `
import contextlib, io, json, sys
results = []
for case in json.load(sys.stdin):
    output = io.StringIO()
    error = None
    with contextlib.redirect_stdout(output):
        try:
            exec(compile(case["code"], "<flashcard>", "exec"), {})
        except Exception as exc:
            error = type(exc).__name__
    results.append({"id": case["id"], "output": output.getvalue(), "error": error})
print(json.dumps(results))
`;
    const run = spawnSync(process.env.PMC_TEST_PYTHON || "python", ["-I", "-c", audit], {
      input: JSON.stringify(cases),
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 100_000,
    });
    expect(run.error).toBeUndefined();
    expect(run.status, run.stderr).toBe(0);
    const actual = JSON.parse(run.stdout) as { id: string; output: string; error: string | null }[];
    expect(actual).toHaveLength(cases.length);
    for (const [index, result] of actual.entries()) {
      expect(result.id).toBe(cases[index].id);
      expect(result.error).toBeNull();
      expect(result.output).toBe(cases[index].output);
    }
  });
});
