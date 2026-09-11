import type { Challenge, Choice } from "../types";

export type Draft = Omit<
  Challenge,
  "id" | "family" | "choices" | "answer" | "traceEnabled"
> & {
  correct: string;
  distractors: [string, string][];
  traceEnabled?: boolean;
};

export const variants = [0, 1, 2, 3] as const;
export const stdout = (value: string | number | boolean) => `${value}\n`;
export const pyBool = (value: boolean) => (value ? "True" : "False");
export const pyList = (values: number[]) => `[${values.join(", ")}]`;

/** Rotate choice placement without changing stable correct IDs or consuming randomness. */
export function make(family: string, variant: number, draft: Draft): Challenge {
  const { correct, distractors, ...content } = draft;
  const choices: Choice[] = [
    { id: "correct", text: correct, feedback: content.explanation },
    ...distractors.map(([text, feedback], index) => ({
      id: `d${index + 1}`,
      text,
      feedback,
    })),
  ];
  const offset = variant % choices.length;
  return {
    ...content,
    id: `${family}-${variant + 1}`,
    family,
    traceEnabled: draft.traceEnabled ?? true,
    choices: [...choices.slice(offset), ...choices.slice(0, offset)],
    answer: "correct",
  };
}

export function debugging(
  family: string,
  variant: number,
  draft: Draft,
  repair: NonNullable<Challenge["repair"]>,
) {
  return make(family, variant, { ...draft, type: "find-bug", repair });
}
