import { describe, expect, it } from "vitest";
import { parseTrace } from "./bridge";
const valid = {
  events: [
    {
      step: 1,
      event: "line",
      line: 1,
      function: "<module>",
      locals: { x: "4" },
      globals: { x: "4" },
      changes: [{ name: "x", before: null, after: "4" }],
      output: "",
      stack: [{ function: "<module>", line: 1, locals: { x: "4" } }],
      detail: "x is now 4",
    },
  ],
  output: "",
  error: null,
  truncated: false,
};
describe("native trace boundary", () => {
  it("accepts real post-execution state and expected exceptions", () => {
    expect(parseTrace(valid)).toEqual(valid);
    expect(
      parseTrace({
        ...valid,
        error: { type: "ValueError", line: 2, message: "bad value" },
      }).error?.type,
    ).toBe("ValueError");
  });
  it.each([
    { locals: { x: { nested: true } } },
    { changes: [null] },
    { stack: [null] },
    { globals: [] },
    { parameters: { x: 5 } },
    { returnValue: 12 },
    { decision: "True" },
    { iteration: 0 },
    { step: 2 },
  ])("rejects malformed nested values %j", (bad) => {
    expect(() =>
      parseTrace({ ...valid, events: [{ ...valid.events[0], ...bad }] }),
    ).toThrow();
  });
  it("rejects missing or unbounded protocols", () => {
    expect(() => parseTrace(null)).toThrow();
    expect(() => parseTrace({ ...valid, output: "x".repeat(48001) })).toThrow();
  });
});
