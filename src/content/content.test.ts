import { describe, expect, it } from "vitest";
import type { ChallengeType } from "../types";
import {
  baselineIds,
  bossIds,
  challenges,
  defaultWeights,
  topics,
  validateContent,
} from "./index";

describe("curriculum contract", () => {
  it("has valid unique, fully explained items", () => {
    expect(validateContent()).toEqual([]);
    expect(challenges.length).toBeGreaterThanOrEqual(150);
  });

  it("keeps four distinct, deterministic source variations per family", () => {
    const families = new Map<string, typeof challenges>();
    for (const item of challenges)
      families.set(item.family, [...(families.get(item.family) ?? []), item]);
    expect(families.size).toBeGreaterThanOrEqual(35);
    for (const [family, items] of families) {
      expect(items, family).toHaveLength(4);
      expect(new Set(items.map((item) => item.code)).size, family).toBe(4);
    }
  });

  it("supports every promised interaction type", () => {
    const required: ChallengeType[] = [
      "predict-output",
      "next-line",
      "variable-value",
      "condition",
      "function-return",
      "find-bug",
      "repair",
      "fill-line",
      "order-lines",
      "collection-state",
      "exception",
      "traceback",
      "scope",
      "test-input",
      "loop-count",
    ];
    const actual = new Set(challenges.map((item) => item.type));
    for (const type of required) expect(actual.has(type), type).toBe(true);
  });

  it("executes exactly the selected completed line or ordered source", () => {
    for (const item of challenges) {
      if (item.type === "order-lines") {
        const orderedSource = item
          .order!.map(
            (id) => item.choices.find((choice) => choice.id === id)!.text,
          )
          .join("\n");
        expect(item.code, item.id).toBe(orderedSource);
      }
      if (item.type === "fill-line" || item.type === "repair") {
        const chosen = item.choices.find(
          (choice) => choice.id === item.answer,
        )!.text;
        expect(item.code.split("\n")[item.focusLine! - 1].trim(), item.id).toBe(
          chosen,
        );
      }
      if (item.repair) {
        const chosen = item.repair.choices.find(
          (choice) => choice.id === item.repair!.answer,
        )!.text;
        const source = item.code.split("\n");
        const index = item.repair.line - 1;
        const indentation = source[index].match(/^\s*/)![0];
        source[index] = indentation + chosen;
        expect(item.repair.code, item.id).toBe(source.join("\n"));
      }
    }
  });

  it("gives every configured topic assessable exercises and positive default weight", () => {
    expect(
      Object.values(defaultWeights).reduce(
        (total, weight) => total + weight,
        0,
      ),
    ).toBe(100);
    for (const topic of topics) {
      expect(defaultWeights[topic.id]).toBeGreaterThan(0);
      expect(
        challenges.filter((item) => item.topic === topic.id).length,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("has valid, mixed baseline and integrated repair missions", () => {
    const baseline = baselineIds.map((id) =>
      challenges.find((item) => item.id === id),
    );
    expect(baseline.every(Boolean)).toBe(true);
    expect(
      new Set(baseline.map((item) => item?.topic)).size,
    ).toBeGreaterThanOrEqual(7);
    expect(new Set(baselineIds).size).toBe(baselineIds.length);
    expect(bossIds).toHaveLength(5);
    for (const id of bossIds) {
      const item = challenges.find((candidate) => candidate.id === id);
      expect(item?.type).toBe("find-bug");
      expect(item?.repair?.code).toBeTruthy();
    }
  });

  it("rejects duplicate ids, missing answers, and ambiguous ordering data", () => {
    expect(
      validateContent([challenges[0], challenges[0]]).join("\n"),
    ).toContain("duplicate id");
    expect(
      validateContent([{ ...challenges[0], answer: "missing" }]).join("\n"),
    ).toContain("answer missing");
    const order = challenges.find((item) => item.type === "order-lines")!;
    expect(
      validateContent([{ ...order, answer: "d|c|b|a" }]).join("\n"),
    ).toContain("order answer mismatch");
  });
});
