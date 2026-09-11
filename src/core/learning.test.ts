import { describe, expect, it } from "vitest";
import type { Attempt, Challenge, Progress, Topic } from "../types";
import {
  conceptStatus,
  createExam,
  createProgress,
  evaluate,
  phaseFor,
  recordAttempt,
  scaffoldFor,
  scoreExam,
  selectMission,
  similarChallenge,
  topicSummary,
  validateProgress,
} from "./learning";

const NOW = new Date(2026, 8, 11, 12).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TOPICS: Topic[] = [
  "variables",
  "strings",
  "conditionals",
  "collections",
  "loops",
  "functions",
  "exceptions",
  "other",
];
const weights = (
  overrides: Partial<Record<Topic, number>> = {},
): Record<Topic, number> => ({
  variables: 0,
  strings: 0,
  conditionals: 0,
  collections: 0,
  loops: 0,
  functions: 0,
  exceptions: 0,
  other: 0,
  ...overrides,
});
const question = (
  id = "variables-1",
  overrides: Partial<Challenge> = {},
): Challenge => ({
  id,
  family: id.split("-")[0],
  topic: "variables",
  subtopic: "reassignment",
  difficulty: 1,
  type: "predict-output",
  title: "Reassignment",
  code: "x = 2\nprint(x)",
  question: "What prints?",
  choices: [
    { id: "a", text: "2" },
    { id: "b", text: "3" },
  ],
  answer: "a",
  explanation: "x has value 2.",
  misconception: "assignment",
  hints: ["Read the assignment."],
  traceEnabled: true,
  ...overrides,
});
const attempt = (id = "1", overrides: Partial<Attempt> = {}): Attempt => ({
  id,
  challengeId: "variables-1",
  family: "variables",
  topic: "variables",
  answer: "a",
  correct: true,
  hints: 0,
  confidence: 4,
  elapsedMs: 5000,
  at: NOW,
  mode: "training",
  ...overrides,
});
const practice = (
  count: number,
  overrides: Partial<Attempt> = {},
): Progress => {
  let progress = createProgress(NOW);
  for (let index = 0; index < count; index += 1) {
    progress = recordAttempt(
      progress,
      attempt(String(index), { at: NOW + index * 1000, ...overrides }),
    );
  }
  return progress;
};

describe("deterministic evaluation and scoring", () => {
  it("accepts only the chosen correct ID and never an unanswered question", () => {
    expect(evaluate(question(), "a")).toBe(true);
    expect(evaluate(question(), "b")).toBe(false);
    expect(evaluate(question(), "2")).toBe(false);
    expect(evaluate(question(), "")).toBe(false);
    expect(evaluate(question(), " a ")).toBe(true);
  });
  it("evaluates ordered IDs exactly", () => {
    const ordered = question("ordered", {
      type: "order-lines",
      order: ["b", "a", "c"],
      answer: "b|a|c",
    });
    expect(evaluate(ordered, "b|a|c")).toBe(true);
    expect(evaluate(ordered, "a|b|c")).toBe(false);
    expect(evaluate(ordered, "b|a")).toBe(false);
  });
  it("counts unanswered questions as wrong and reports topic totals", () => {
    const questions = [
      question("v1"),
      question("v2"),
      question("loop", { topic: "loops" }),
    ];
    expect(scoreExam(questions, { v1: "a", loop: "b" })).toEqual({
      score: 33,
      topics: {
        variables: { correct: 1, total: 2 },
        loops: { correct: 0, total: 1 },
      },
    });
    expect(scoreExam([], {})).toEqual({ score: 0, topics: {} });
    expect(scoreExam([questions[0], questions[0]], { v1: "a" })).toEqual({
      score: 100,
      topics: { variables: { correct: 1, total: 1 } },
    });
  });
});

describe("progress and spaced review", () => {
  it("updates counters immutably and stores a copy of the attempt", () => {
    const before = createProgress(NOW);
    const input = attempt();
    const after = recordAttempt(before, input);
    expect(before.attempts).toEqual([]);
    expect(before.concepts).toEqual({});
    expect(before.xp).toBe(0);
    expect(after.xp).toBe(20);
    expect(after.sessions).toBe(0);
    expect(after.studyDays).toEqual(["2026-09-11"]);
    expect(after.concepts.variables).toMatchObject({
      attempts: 1,
      correct: 1,
      incorrect: 0,
      noHintCorrect: 1,
      totalMs: 5000,
    });
    input.answer = "changed";
    expect(after.attempts[0].answer).toBe("a");
  });
  it("does not award a replayed attempt ID twice", () => {
    const progress = recordAttempt(createProgress(NOW), attempt());
    expect(recordAttempt(progress, attempt("1", { correct: false }))).toBe(
      progress,
    );
  });
  it("tracks hinted success and confident errors separately", () => {
    let progress = recordAttempt(
      createProgress(NOW),
      attempt("hint", { hints: 2 }),
    );
    progress = recordAttempt(
      progress,
      attempt("error", { correct: false, confidence: 5 }),
    );
    expect(progress.xp).toBe(15);
    expect(progress.concepts.variables).toMatchObject({
      attempts: 2,
      correct: 1,
      incorrect: 1,
      hints: 2,
      noHintAttempts: 1,
      noHintCorrect: 0,
      confidentErrors: 1,
    });
  });
  it("makes a confident error more urgent than other errors or uncertain success", () => {
    const due = (fields: Partial<Attempt>) =>
      recordAttempt(createProgress(NOW), attempt("1", fields)).concepts
        .variables.dueAt;
    expect(due({ correct: false, confidence: 5 }) - NOW).toBe(10 * 60_000);
    expect(due({ correct: false, confidence: 2 }) - NOW).toBe(HOUR);
    expect(due({ confidence: 1 }) - NOW).toBe(4 * HOUR);
    expect(due({ hints: 1 }) - NOW).toBe(8 * HOUR);
  });
  it("spaces stable unaided success and resets spacing after a mistake", () => {
    const intervals = [1, 3, 7, 14, 14];
    for (let index = 1; index <= intervals.length; index += 1) {
      const concept = practice(index).concepts.variables;
      expect(concept.dueAt - concept.lastPracticed).toBe(
        intervals[index - 1] * DAY,
      );
    }
    let progress = recordAttempt(
      practice(8),
      attempt("miss", { correct: false, at: NOW + DAY }),
    );
    progress = recordAttempt(
      progress,
      attempt("recover", { at: NOW + DAY + HOUR }),
    );
    expect(
      progress.concepts.variables.dueAt -
        progress.concepts.variables.lastPracticed,
    ).toBe(DAY);
  });
  it("bounds recent accuracy and labels status without treating one success as strong", () => {
    expect(conceptStatus()).toBe("New");
    expect(conceptStatus(practice(1).concepts.variables)).toBe("Developing");
    expect(conceptStatus(practice(12).concepts.variables)).toBe("Strong");
    const missed = recordAttempt(
      practice(12),
      attempt("missed", { correct: false }),
    );
    expect(missed.concepts.variables.recent).toHaveLength(8);
    expect(conceptStatus(missed.concepts.variables)).toBe("Needs work");
  });
  it("combines families into one useful topic summary", () => {
    let progress = practice(3);
    progress = recordAttempt(
      progress,
      attempt("other-family", { family: "types", hints: 2, correct: false }),
    );
    expect(topicSummary(progress, "variables")).toMatchObject({
      attempts: 4,
      correct: 3,
      incorrect: 1,
      hints: 2,
      totalMs: 20_000,
    });
    expect(topicSummary(progress, "functions")).toBeUndefined();
  });
});

describe("scaffolding and phase progression", () => {
  it("fades support on demonstrated unaided success and restores it after errors", () => {
    expect(scaffoldFor(createProgress(NOW), question())).toBe("guided");
    expect(scaffoldFor(practice(3), question())).toBe("guided");
    expect(scaffoldFor(practice(4), question())).toBe("light");
    expect(scaffoldFor(practice(8), question())).toBe("independent");
    expect(scaffoldFor(practice(8, { hints: 1 }), question())).toBe("guided");
    const missed = recordAttempt(
      practice(8),
      attempt("missed", { correct: false }),
    );
    expect(scaffoldFor(missed, question())).toBe("guided");
  });
  it("keeps concept assistance separate and phases tied to unaided success", () => {
    expect(
      scaffoldFor(
        practice(8),
        question("functions-1", { family: "functions" }),
      ),
    ).toBe("guided");
    expect(phaseFor(practice(0))).toBe("foundation");
    expect(phaseFor(practice(31))).toBe("foundation");
    expect(phaseFor(practice(32))).toBe("fluency");
    expect(phaseFor(practice(100))).toBe("exam-preparation");
    expect(phaseFor(practice(160, { correct: false }))).toBe("foundation");
    expect(phaseFor(practice(160, { hints: 1 }))).toBe("foundation");
  });
});

describe("question selection", () => {
  const bank = TOPICS.flatMap((topic) =>
    Array.from({ length: 20 }, (_, index) =>
      question(`${topic}-${index}`, {
        topic,
        family: `${topic}-family-${Math.floor(index / 2)}`,
      }),
    ),
  );

  it("creates reproducible weighted exams, avoids duplicate IDs, and varies the seed", () => {
    const blueprint = weights({ variables: 80, loops: 20 });
    const first = createExam(bank, blueprint, 10, 123);
    expect(first.filter((item) => item.topic === "variables")).toHaveLength(8);
    expect(first.filter((item) => item.topic === "loops")).toHaveLength(2);
    expect(new Set(first.map((item) => item.id)).size).toBe(10);
    expect(new Set(first.map((item) => item.family)).size).toBe(10);
    expect(createExam(bank, blueprint, 10, 123)).toEqual(first);
    expect(createExam(bank, blueprint, 10, 124)).not.toEqual(first);
  });
  it("handles empty inputs, exhausted topics, zero weights and invalid counts", () => {
    expect(createExam([], weights(), 10, 1)).toEqual([]);
    expect(createExam(bank, weights({ variables: 1 }), -2, 1)).toEqual([]);
    expect(createExam(bank, weights({ variables: 1 }), Infinity, 1)).toEqual(
      [],
    );
    expect(createExam(bank, weights({ variables: 1 }), 30, 1)).toHaveLength(20);
    expect(
      createExam(bank, weights(), 8, 1)
        .map((item) => item.topic)
        .sort(),
    ).toEqual([...TOPICS].sort());
    expect(
      createExam([bank[0], bank[0]], weights({ variables: 1 }), 5, 1),
    ).toHaveLength(1);
  });
  it("prioritizes due confident errors and chooses a new variant", () => {
    const progress = recordAttempt(
      createProgress(NOW),
      attempt("weak", {
        family: "loops-family-0",
        topic: "loops",
        challengeId: "loops-0",
        correct: false,
        confidence: 5,
      }),
    );
    const mission = selectMission(bank, progress, 6, NOW + HOUR);
    expect(mission[0].id).toBe("loops-1");
    expect(new Set(mission.map((item) => item.family)).size).toBe(6);
    expect(new Set(mission.map((item) => item.id)).size).toBe(6);
    expect(selectMission(bank, progress, 6, NOW + HOUR)).toEqual(mission);
  });
  it("respects blueprint exclusions and difficulty progression", () => {
    const beginner = createProgress(NOW);
    beginner.settings.weights = weights({ loops: 1 });
    const missions = selectMission(
      [...bank, question("hard", { topic: "loops", difficulty: 3 })],
      beginner,
      6,
      NOW,
    );
    expect(missions).toHaveLength(6);
    expect(
      missions.every((item) => item.topic === "loops" && item.difficulty === 1),
    ).toBe(true);
    expect(selectMission([], beginner, 6, NOW)).toEqual([]);
    expect(selectMission(bank, beginner, 0, NOW)).toEqual([]);
    expect(
      selectMission(
        [
          question("basic"),
          question("hard", { topic: "loops", difficulty: 3 }),
        ],
        beginner,
        6,
        NOW,
      ).map((item) => item.id),
    ).toEqual(["hard"]);
  });
  it("finds related unseen follow-ups and returns undefined when none remain", () => {
    expect(similarChallenge(bank, bank[0], [])?.id).toBe(bank[1].id);
    expect(
      similarChallenge([bank[0], bank[1]], bank[0], [bank[1].id]),
    ).toBeUndefined();
  });
});

describe("persistent data validation", () => {
  it("round-trips empty and practiced progress without sharing mutable references", () => {
    const progress = practice(10);
    const loaded = validateProgress(JSON.parse(JSON.stringify(progress)));
    expect(loaded).toEqual(progress);
    expect(loaded).not.toBe(progress);
    expect(validateProgress(createProgress(NOW))).toEqual(createProgress(NOW));
  });
  it.each([
    [
      "version",
      (p: Progress) => {
        (p as unknown as Record<string, unknown>).version = 2;
      },
    ],
    [
      "score",
      (p: Progress) => {
        p.settings.targetScore = NaN;
      },
    ],
    [
      "weight",
      (p: Progress) => {
        p.settings.weights.loops = -1;
      },
    ],
    [
      "zero weights",
      (p: Progress) => {
        p.settings.weights = weights();
      },
    ],
    [
      "timestamp",
      (p: Progress) => {
        p.startedAt = Infinity;
      },
    ],
    [
      "date",
      (p: Progress) => {
        p.studyDays = ["2026-02-31"];
      },
    ],
    [
      "duplicate attempt",
      (p: Progress) => {
        p.attempts.push(p.attempts[0]);
      },
    ],
    [
      "aggregate",
      (p: Progress) => {
        p.concepts.variables.correct += 1;
      },
    ],
    [
      "recent results",
      (p: Progress) => {
        p.concepts.variables.recent = [false];
      },
    ],
    [
      "XP",
      (p: Progress) => {
        p.xp += 1000;
      },
    ],
    [
      "confidence",
      (p: Progress) => {
        p.attempts[0].confidence = 7;
      },
    ],
    [
      "due date",
      (p: Progress) => {
        p.concepts.variables.dueAt = NOW - 1;
      },
    ],
    [
      "topic change",
      (p: Progress) => {
        p.attempts[1].topic = "loops";
      },
    ],
  ])("rejects corrupt %s instead of silently resetting", (_name, corrupt) => {
    const progress = practice(2);
    corrupt(progress);
    expect(() => validateProgress(progress)).toThrow(
      /Saved progress is invalid/,
    );
  });
  it("rejects prototype keys and incorrect exam aggregate scores", () => {
    const polluted = JSON.parse(JSON.stringify(createProgress(NOW)));
    polluted.concepts = JSON.parse('{"__proto__":{}}');
    expect(() => validateProgress(polluted)).toThrow(/concepts/);
    expect(() =>
      recordAttempt(
        createProgress(NOW),
        attempt("unsafe-family", { family: "toString" }),
      ),
    ).toThrow(/family/);
    const progress = createProgress(NOW);
    progress.exams.push({
      id: "exam",
      kind: "exam",
      at: NOW,
      elapsedMs: 1000,
      challengeIds: ["one"],
      answers: { one: "a" },
      score: 100,
      topics: { variables: { correct: 0, total: 1 } },
    });
    expect(() => validateProgress(progress)).toThrow(/score/);
    progress.exams[0].score = 0;
    expect(validateProgress(progress).exams[0].score).toBe(0);
  });
  it("preserves an in-progress timed exam with no exposed answers", () => {
    const progress = createProgress(NOW);
    progress.activeAssessment = {
      id: "active",
      mode: "exam",
      ids: ["one", "two"],
      answers: { one: "b" },
      confidences: { one: 3 },
      times: { one: 5000 },
      startedAt: NOW,
      deadline: NOW + HOUR,
      index: 1,
    };
    expect(validateProgress(progress).activeAssessment).toEqual(
      progress.activeAssessment,
    );
    progress.activeAssessment.index = 2;
    expect(() => validateProgress(progress)).toThrow(/index/);
    progress.activeAssessment.index = 1;
    progress.activeAssessment.deadline = null;
    expect(() => validateProgress(progress)).toThrow(/deadline/);
    progress.activeAssessment.mode = "baseline";
    expect(validateProgress(progress).activeAssessment?.deadline).toBeNull();
    progress.activeAssessment.answers.stranger = "a";
    expect(() => validateProgress(progress)).toThrow(/answers/);
  });
});
