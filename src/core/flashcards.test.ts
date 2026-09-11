import { describe, expect, it } from "vitest";
import type { Attempt, Progress } from "../types";
import { challenges } from "../content";
import { flashcards, validateFlashcards } from "../content/flashcards";
import {
  applyAttemptSignal,
  dueFlashcards,
  emptyFlashcardState,
  flashcardKeyboardAction,
  flashcardStats,
  isFlashcardNeedsWork,
  needsWorkFlashcards,
  rateFlashcard,
  selectFlashcards,
} from "./flashcards";
import {
  createProgress,
  recordAttempt,
  scoreExam,
  validateProgress,
} from "./learning";

const NOW = new Date(2026, 8, 11, 12).getTime();
const MINUTE = 60_000;
const DAY = 86_400_000;

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: "flashcard-signal",
    challengeId: "assignment-copy-1",
    family: "assignment-copy",
    topic: "variables",
    answer: "wrong",
    correct: false,
    hints: 0,
    confidence: 2,
    elapsedMs: 1000,
    at: NOW,
    mode: "training",
    ...overrides,
  };
}

function withState(
  cardId: string,
  state: ReturnType<typeof emptyFlashcardState>,
): Progress {
  const progress = createProgress(NOW);
  return { ...progress, flashcards: { [cardId]: state } };
}

describe("flashcard scheduling and selection", () => {
  const card = flashcards[0];

  it("selects new cards as due and prioritizes a promoted card", () => {
    const progress = createProgress(NOW);
    const selected = selectFlashcards(flashcards, progress, "recommended", "all", NOW, 12);
    expect(selected).toHaveLength(12);
    expect(dueFlashcards(flashcards, progress, NOW)).toHaveLength(flashcards.length);
    const promoted = rateFlashcard(progress, card, "again", NOW);
    const withPriority = { ...progress, flashcards: { [card.id]: promoted } };
    expect(
      selectFlashcards(
        flashcards,
        withPriority,
        "recommended",
        "all",
        NOW + 11 * MINUTE,
        1,
      )[0].id,
    ).toBe(card.id);
  });

  it("filters Needs Work and topics without changing the bank", () => {
    const promoted = rateFlashcard(createProgress(NOW), card, "again", NOW);
    const progress = withState(card.id, promoted);
    expect(needsWorkFlashcards(flashcards, progress, NOW)).toContainEqual(card);
    expect(selectFlashcards(flashcards, progress, "needs-work", "variables", NOW, 100)).toEqual(
      expect.arrayContaining([card]),
    );
    expect(selectFlashcards(flashcards, progress, "needs-work", "loops", NOW, 100)).not.toContainEqual(card);
    expect(validateFlashcards(flashcards)).toEqual([]);
  });

  it("schedules Again, Hard, and Got It transparently", () => {
    const fresh = createProgress(NOW);
    const again = rateFlashcard(fresh, card, "again", NOW);
    expect(again.nextDue - NOW).toBe(10 * MINUTE);
    expect(again.stage).toBe(0);
    expect(again.againCount).toBe(1);
    const hard = rateFlashcard(fresh, card, "hard", NOW);
    expect(hard.nextDue - NOW).toBe(DAY);
    expect(hard.hardCount).toBe(1);
    const gotIt = rateFlashcard(fresh, card, "got-it", NOW);
    expect(gotIt.nextDue - NOW).toBe(DAY);
    expect(gotIt.stage).toBe(1);
    expect(gotIt.gotItCount).toBe(1);
  });

  it("increases spacing after repeated successful retrieval", () => {
    let progress = createProgress(NOW);
    const intervals = [1, 3, 7, 14, 30];
    for (const interval of intervals) {
      const state = rateFlashcard(progress, card, "got-it", NOW);
      expect(state.intervalDays).toBe(interval);
      progress = { ...progress, flashcards: { [card.id]: state } };
    }
  });

  it("returns an empty recommended queue when every card is scheduled later", () => {
    let progress = createProgress(NOW);
    const states = Object.fromEntries(
      flashcards.map((item) => [item.id, rateFlashcard(progress, item, "got-it", NOW)]),
    );
    progress = { ...progress, flashcards: states };
    expect(selectFlashcards(flashcards, progress, "recommended", "all", NOW, 12)).toEqual([]);
    expect(dueFlashcards(flashcards, progress, NOW)).toEqual([]);
    expect(flashcardStats(flashcards, progress, NOW).due).toBe(0);
  });

  it("ignores malformed cards rather than crashing the review queue", () => {
    const malformed = { id: "bad" };
    const unknownLink = {
      ...flashcards[0],
      id: "bad-link",
      relatedChallengeIds: ["missing-challenge"],
    };
    const bank = [...flashcards, malformed, unknownLink];
    expect(() => selectFlashcards(bank, createProgress(NOW))).not.toThrow();
    expect(selectFlashcards(bank, createProgress(NOW), "all", "all", NOW, 1000)).toHaveLength(
      flashcards.length,
    );
  });
});

describe("learning-system signals", () => {
  const card = flashcards.find((item) =>
    item.relatedChallengeIds.includes("assignment-copy-1"),
  )!;

  it("raises priority for a wrong Training Deck concept", () => {
    const next = recordAttempt(createProgress(NOW), attempt());
    expect(next.flashcards[card.id].priority).toBeGreaterThan(0);
    expect(isFlashcardNeedsWork(next, card, NOW)).toBe(true);
  });

  it("raises high-confidence misses more strongly than uncertain misses", () => {
    const uncertain = recordAttempt(
      createProgress(NOW),
      attempt({ id: "uncertain", confidence: 2 }),
    );
    const confident = recordAttempt(
      createProgress(NOW),
      attempt({ id: "confident", confidence: 5 }),
    );
    expect(confident.flashcards[card.id].priority).toBeGreaterThan(
      uncertain.flashcards[card.id].priority,
    );
    expect(confident.flashcards[card.id].nextDue).toBe(0);
  });

  it("promotes a relevant card after a submitted Mock Exam miss", () => {
    const examMiss = applyAttemptSignal(
      createProgress(NOW),
      attempt({ id: "exam-miss", mode: "exam" }),
    );
    expect(examMiss.flashcards[card.id].priority).toBeGreaterThan(0);
    expect(examMiss.flashcards[card.id].nextDue).toBe(0);
  });

  it("keeps exam scoring independent from flashcard ratings", () => {
    const question = challenges.find((item) => item.id === "assignment-copy-1")!;
    const progress = recordAttempt(
      createProgress(NOW),
      attempt({ id: "exam-miss", mode: "exam" }),
    );
    expect(scoreExam([question], { [question.id]: question.answer }).score).toBe(100);
    expect(progress.exams).toEqual([]);
    const gotIt = rateFlashcard(progress, card, "got-it", NOW);
    expect(scoreExam([question], {}).score).toBe(0);
    expect(gotIt.gotItCount).toBe(1);
  });
});

describe("flashcard persistence and input handling", () => {
  it("migrates old progress and preserves rated state across a restart", () => {
    const card = flashcards[0];
    const old = createProgress(NOW) as unknown as Record<string, unknown>;
    delete old.flashcards;
    const migrated = validateProgress(old);
    expect(migrated.flashcards).toEqual({});
    const state = rateFlashcard(migrated, card, "hard", NOW);
    const saved = { ...migrated, flashcards: { [card.id]: state } };
    const reopened = validateProgress(JSON.parse(JSON.stringify(saved)));
    expect(reopened.flashcards[card.id]).toEqual(state);
  });

  it("rejects inconsistent persisted flashcard aggregates", () => {
    const card = flashcards[0];
    const state = rateFlashcard(createProgress(NOW), card, "again", NOW);
    const corrupt = withState(card.id, { ...state, reviews: 99 });
    expect(() => validateProgress(corrupt)).toThrow(/flashcards/);
  });

  it("keeps keyboard shortcuts inside the study surface and away from inputs", () => {
    expect(flashcardKeyboardAction(" ", false)).toBe("reveal");
    expect(flashcardKeyboardAction("1", true)).toBe("again");
    expect(flashcardKeyboardAction("2", true)).toBe("hard");
    expect(flashcardKeyboardAction("3", true)).toBe("got-it");
    expect(flashcardKeyboardAction("1", true, true)).toBeNull();
    expect(flashcardKeyboardAction(" ", true)).toBeNull();
  });
});
