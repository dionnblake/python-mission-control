import { challenges } from "../content";
import { flashcards as starterFlashcards, validateFlashcards } from "../content/flashcards";
import type {
  Attempt,
  Flashcard,
  FlashcardRating,
  FlashcardState,
  Progress,
  Topic,
} from "../types";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const MAX_DATE = 253_402_300_799_999;
const MAX_PRIORITY = 100;
const NEEDS_WORK_PRIORITY = 5;
const INTERVAL_LADDER = [1, 3, 7, 14, 30];
const knownChallengeIds = new Set(challenges.map((challenge) => challenge.id));

export type FlashcardMode = "recommended" | "needs-work" | "all";
export type FlashcardTopic = "all" | Topic;

export type FlashcardKeyboardAction = "reveal" | FlashcardRating;

export function flashcardKeyboardAction(
  key: string,
  revealed: boolean,
  interactiveTarget = false,
): FlashcardKeyboardAction | null {
  if (interactiveTarget) return null;
  if (key === " " && !revealed) return "reveal";
  if (!revealed) return null;
  return key === "1" ? "again" : key === "2" ? "hard" : key === "3" ? "got-it" : null;
}

function clampPriority(priority: number): number {
  return Math.max(0, Math.min(MAX_PRIORITY, Math.round(priority)));
}

function boundedDate(date: number): number {
  return Math.min(MAX_DATE, Math.max(0, Math.round(date)));
}

export function emptyFlashcardState(card: Flashcard): FlashcardState {
  return {
    cardId: card.id,
    topic: card.topic,
    concept: card.concept,
    firstSeen: 0,
    lastReviewed: 0,
    nextDue: 0,
    reviews: 0,
    againCount: 0,
    hardCount: 0,
    gotItCount: 0,
    stage: 0,
    intervalDays: 0,
    priority: 0,
  };
}

export function flashcardState(
  progress: Progress,
  card: Flashcard,
): FlashcardState {
  return progress.flashcards[card.id] ?? emptyFlashcardState(card);
}

function validCards(bank: readonly unknown[]): Flashcard[] {
  return bank.filter(
    (candidate): candidate is Flashcard =>
      validateFlashcards([candidate], knownChallengeIds).length === 0,
  );
}

function linkedAttempts(progress: Progress, card: Flashcard): Attempt[] {
  const linked = new Set(card.relatedChallengeIds);
  return progress.attempts.filter((attempt) => linked.has(attempt.challengeId));
}

/**
 * Priority is deliberately inspectable: stored signals come from direct
 * feedback, while recent linked challenge accuracy adds only a small nudge.
 */
export function flashcardPriority(
  progress: Progress,
  card: Flashcard,
  now = Date.now(),
): number {
  const state = flashcardState(progress, card);
  const recent = linkedAttempts(progress, card).slice(-6);
  const misses = recent.filter((attempt) => !attempt.correct).length;
  const accuracyNudge =
    recent.length >= 2 && misses >= 3
      ? 3
      : recent.length >= 2 && misses >= 2
        ? 2
        : 0;
  const staleNudge =
    state.priority > 0 && state.lastReviewed > 0 && now - state.lastReviewed >= 14 * DAY
      ? 1
      : 0;
  return clampPriority(state.priority + accuracyNudge + staleNudge);
}

export function isFlashcardDue(
  progress: Progress,
  card: Flashcard,
  now = Date.now(),
): boolean {
  return flashcardState(progress, card).nextDue <= now;
}

export function isFlashcardNeedsWork(
  progress: Progress,
  card: Flashcard,
  now = Date.now(),
): boolean {
  const state = flashcardState(progress, card);
  return (
    flashcardPriority(progress, card, now) >= NEEDS_WORK_PRIORITY ||
    state.againCount > 0 ||
    (state.hardCount > state.gotItCount && state.reviews > 0)
  );
}

function sortCards(
  progress: Progress,
  cards: Flashcard[],
  now: number,
): Flashcard[] {
  return [...cards].sort((left, right) => {
    const leftState = flashcardState(progress, left);
    const rightState = flashcardState(progress, right);
    const leftDue = leftState.nextDue <= now;
    const rightDue = rightState.nextDue <= now;
    return (
      Number(rightDue) - Number(leftDue) ||
      flashcardPriority(progress, right, now) -
        flashcardPriority(progress, left, now) ||
      leftState.nextDue - rightState.nextDue ||
      leftState.reviews - rightState.reviews ||
      left.id.localeCompare(right.id)
    );
  });
}

export function dueFlashcards(
  bank: readonly unknown[],
  progress: Progress,
  now = Date.now(),
  topic: FlashcardTopic = "all",
): Flashcard[] {
  return validCards(bank).filter(
    (card) =>
      (topic === "all" || card.topic === topic) &&
      isFlashcardDue(progress, card, now),
  );
}

export function needsWorkFlashcards(
  bank: readonly unknown[],
  progress: Progress,
  now = Date.now(),
  topic: FlashcardTopic = "all",
): Flashcard[] {
  return validCards(bank).filter(
    (card) =>
      (topic === "all" || card.topic === topic) &&
      isFlashcardNeedsWork(progress, card, now),
  );
}

export function selectFlashcards(
  bank: readonly unknown[],
  progress: Progress,
  mode: FlashcardMode = "recommended",
  topic: FlashcardTopic = "all",
  now = Date.now(),
  limit = 12,
): Flashcard[] {
  const candidates = validCards(bank).filter(
    (card) => topic === "all" || card.topic === topic,
  );
  const filtered =
    mode === "recommended"
      ? candidates.filter((card) => isFlashcardDue(progress, card, now))
      : mode === "needs-work"
        ? candidates.filter((card) => isFlashcardNeedsWork(progress, card, now))
        : candidates;
  const count = Number.isFinite(limit)
    ? Math.max(0, Math.min(filtered.length, Math.floor(limit)))
    : 0;
  return sortCards(progress, filtered, now).slice(0, count);
}

export interface FlashcardStats {
  total: number;
  due: number;
  needsWork: number;
  reviewed: number;
  recallRate: number | null;
  weakConcepts: number;
  priorityTopic: Topic | null;
}

export function flashcardStats(
  bank: readonly unknown[],
  progress: Progress,
  now = Date.now(),
): FlashcardStats {
  const cards = validCards(bank);
  const due = cards.filter((card) => isFlashcardDue(progress, card, now));
  const needsWork = cards.filter((card) =>
    isFlashcardNeedsWork(progress, card, now),
  );
  const states = cards.map((card) => flashcardState(progress, card));
  const reviewed = states.reduce((sum, state) => sum + state.reviews, 0);
  const gotIt = states.reduce((sum, state) => sum + state.gotItCount, 0);
  const topicPriority = new Map<Topic, number>();
  for (const card of due) {
    const priority = flashcardPriority(progress, card, now);
    if (priority <= 0) continue;
    topicPriority.set(
      card.topic,
      (topicPriority.get(card.topic) ?? 0) + priority,
    );
  }
  const priorityTopic =
    [...topicPriority.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]?.[0] ?? null;
  return {
    total: cards.length,
    due: due.length,
    needsWork: needsWork.length,
    reviewed,
    recallRate: reviewed ? Math.round((gotIt / reviewed) * 100) : null,
    weakConcepts: new Set(needsWork.map((card) => card.concept)).size,
    priorityTopic,
  };
}

export function rateFlashcard(
  progress: Progress,
  card: Flashcard,
  rating: FlashcardRating,
  now = Date.now(),
): FlashcardState {
  const previous = flashcardState(progress, card);
  const next: FlashcardState = {
    ...previous,
    firstSeen: previous.firstSeen || boundedDate(now),
    lastReviewed: boundedDate(now),
    reviews: previous.reviews + 1,
  };
  if (rating === "again") {
    return {
      ...next,
      againCount: previous.againCount + 1,
      stage: 0,
      intervalDays: 0,
      nextDue: boundedDate(now + 10 * MINUTE),
      priority: clampPriority(Math.max(NEEDS_WORK_PRIORITY, previous.priority + 4)),
    };
  }
  if (rating === "hard") {
    const intervalDays = Math.max(
      1,
      previous.intervalDays
        ? Math.floor(previous.intervalDays / 2)
        : 1,
    );
    return {
      ...next,
      hardCount: previous.hardCount + 1,
      stage: Math.max(1, previous.stage),
      intervalDays,
      nextDue: boundedDate(now + intervalDays * DAY),
      priority: clampPriority(previous.priority + 2),
    };
  }
  const stage = Math.min(INTERVAL_LADDER.length, previous.stage + 1);
  const intervalDays = INTERVAL_LADDER[stage - 1];
  return {
    ...next,
    gotItCount: previous.gotItCount + 1,
    stage,
    intervalDays,
    nextDue: boundedDate(now + intervalDays * DAY),
    priority: clampPriority(previous.priority - 3),
  };
}

/** Apply a transparent signal from a committed Training Deck or exam answer. */
export function applyAttemptSignal(
  progress: Progress,
  attempt: Attempt,
  bank: readonly unknown[] = starterFlashcards,
): Progress {
  const related = validCards(bank).filter((card) =>
    card.relatedChallengeIds.includes(attempt.challengeId),
  );
  if (!related.length) return progress;
  const nextFlashcards = { ...progress.flashcards };
  for (const card of related) {
    const previous = nextFlashcards[card.id] ?? emptyFlashcardState(card);
    if (attempt.correct) {
      nextFlashcards[card.id] = {
        ...previous,
        priority: clampPriority(
          previous.priority - (attempt.hints > 0 ? 1 : 2),
        ),
      };
      continue;
    }
    const modeWeight = attempt.mode === "exam" ? 5 : 6;
    const confidenceWeight = attempt.confidence >= 4 ? 7 : 0;
    const hintWeight = attempt.hints > 1 ? 2 : 0;
    const delay = attempt.confidence >= 4 ? 10 * MINUTE : 60 * MINUTE;
    nextFlashcards[card.id] = {
      ...previous,
      nextDue: Math.min(previous.nextDue, boundedDate(attempt.at + delay)),
      priority: clampPriority(
        previous.priority + modeWeight + confidenceWeight + hintWeight,
      ),
    };
  }
  return { ...progress, flashcards: nextFlashcards };
}
