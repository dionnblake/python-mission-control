import type { Challenge, Topic, TopicInfo } from "../types";
import { foundation, ordering } from "./foundation";
import { fluency } from "./fluency";

export const topics: TopicInfo[] = [
  {
    id: "variables",
    name: "Variables",
    description: "Values, types, expressions, assignment and execution order.",
    phase: 1,
  },
  {
    id: "strings",
    name: "Strings",
    description: "Text operations, indexes, slices and string methods.",
    phase: 1,
  },
  {
    id: "conditionals",
    name: "Conditions",
    description: "Comparisons, truthiness, branches and boundary decisions.",
    phase: 1,
  },
  {
    id: "collections",
    name: "Collections",
    description: "Lists, tuples, dictionaries, sets, membership and mutation.",
    phase: 1,
  },
  {
    id: "loops",
    name: "Loops",
    description: "Ranges, counters, accumulators, while, break and continue.",
    phase: 1,
  },
  {
    id: "functions",
    name: "Functions",
    description: "Calls, arguments, returns, scope and default arguments.",
    phase: 1,
  },
  {
    id: "exceptions",
    name: "Exceptions",
    description:
      "Read failures, identify their source and follow error handling.",
    phase: 2,
  },
  {
    id: "other",
    name: "Python tools",
    description:
      "Conversions and common built-ins that support basic reasoning.",
    phase: 2,
  },
];

/** Editable exam blueprint. The app may override these weights in local settings. */
export const defaultWeights: Record<Topic, number> = {
  variables: 10,
  strings: 10,
  conditionals: 15,
  collections: 20,
  loops: 20,
  functions: 15,
  exceptions: 7,
  other: 3,
};

export const challenges: Challenge[] = [...foundation, ...ordering, ...fluency];

export const baselineIds: string[] = [
  "assignment-copy-1",
  "string-index-2",
  "true-branch-reassign-1",
  "dictionary-key-2",
  "range-count-1",
  "accumulator-2",
  "function-arguments-1",
  "print-versus-return-2",
  "type-mismatch-1",
  "explicit-conversion-2",
];

export const bossIds: string[] = [
  "bug-running-total-1",
  "bug-inclusive-range-2",
  "bug-missing-return-3",
  "bug-dictionary-key-4",
  "bug-loop-return-1",
];

/** Fail clearly during tests or authoring if content breaks the interaction contract. */
export function validateContent(bank: Challenge[] = challenges): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const knownTopics = new Set(topics.map((topic) => topic.id));
  for (const item of bank) {
    const issue = (message: string) => errors.push(`${item.id}: ${message}`);
    if (!item.id || ids.has(item.id)) issue("missing or duplicate id");
    ids.add(item.id);
    if (!knownTopics.has(item.topic)) issue("unknown topic");
    for (const [key, value] of Object.entries({
      family: item.family,
      subtopic: item.subtopic,
      title: item.title,
      code: item.code,
      question: item.question,
      explanation: item.explanation,
      misconception: item.misconception,
    })) {
      if (!value?.trim()) issue(`missing ${key}`);
    }
    if (![1, 2, 3].includes(item.difficulty)) issue("invalid difficulty");
    if (item.hints.length < 2 || item.hints.some((hint) => !hint.trim()))
      issue("incomplete hint ladder");
    if (item.choices.length < 2) issue("not enough choices");
    if (
      new Set(item.choices.map((choice) => choice.id)).size !==
      item.choices.length
    )
      issue("duplicate choice ids");
    if (
      new Set(item.choices.map((choice) => choice.text)).size !==
      item.choices.length
    )
      issue("duplicate choice text");
    if (item.choices.some((choice) => !choice.id || !choice.text.trim()))
      issue("empty choice");
    if (item.type === "order-lines") {
      if (!item.order || item.answer !== item.order.join("|"))
        issue("order answer mismatch");
      if (
        item.order?.length !== item.choices.length ||
        new Set(item.order).size !== item.choices.length
      )
        issue("order does not use each line exactly once");
      if (
        item.order?.some(
          (id) => !item.choices.some((choice) => choice.id === id),
        )
      )
        issue("order references missing choice");
    } else {
      if (!item.choices.some((choice) => choice.id === item.answer))
        issue("answer missing from choices");
      if (item.choices.some((choice) => !choice.feedback?.trim()))
        issue("missing choice-specific feedback");
    }
    if (typeof item.expectedOutput !== "string")
      issue("missing exact expected stdout");
    if (
      item.focusLine !== undefined &&
      (item.focusLine < 1 || item.focusLine > item.code.split("\n").length)
    )
      issue("focusLine outside source");
    if (
      item.type === "fill-line" &&
      (!item.displayCode || item.displayCode === item.code)
    )
      issue("fill-line exposes completed source");
    if (item.type === "find-bug" && !item.repair)
      issue("debugging incident has no repair");
    if (item.repair) {
      if (
        !item.repair.choices.some((choice) => choice.id === item.repair?.answer)
      )
        issue("repair answer missing");
      if (item.repair.code === item.code || !item.repair.code.trim())
        issue("repair does not change source");
      if (!item.repair.choices.every((choice) => choice.feedback?.trim()))
        issue("missing repair feedback");
      if (typeof item.repair.expectedOutput !== "string")
        issue("missing repaired stdout");
      if (
        item.repair.line < 1 ||
        item.repair.line > item.code.split("\n").length
      )
        issue("repair line outside source");
    }
  }
  return errors;
}
