import { defaultWeights } from "../content";
import { applyAttemptSignal } from "./flashcards";
import type {
  Attempt,
  Challenge,
  ConceptProgress,
  ExamResult,
  FlashcardState,
  Progress,
  Scaffold,
  Topic,
} from "../types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RECENT_COUNT = 8;
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
const MAX_DATE = 253_402_300_799_999;
const MAX_ATTEMPTS = 200_000;

export function createProgress(now = Date.now()): Progress {
  return {
    version: 1,
    startedAt: now,
    onboardingComplete: false,
    baselineComplete: false,
    xp: 0,
    sessions: 0,
    studyDays: [],
    concepts: {},
    attempts: [],
    exams: [],
    settings: {
      targetScore: 80,
      sessionLength: 12,
      textScale: 1,
      weights: { ...defaultWeights },
    },
    flashcards: {},
  };
}

/** Answers are choice IDs, or the pipe-joined IDs of an ordered sequence. */
export function evaluate(challenge: Challenge, answer: string): boolean {
  const expected =
    challenge.type === "order-lines" && challenge.order
      ? challenge.order.join("|")
      : challenge.answer;
  return answer.trim().length > 0 && answer.trim() === expected;
}

function emptyConcept(): ConceptProgress {
  return {
    attempts: 0,
    correct: 0,
    incorrect: 0,
    hints: 0,
    recent: [],
    noHintAttempts: 0,
    noHintCorrect: 0,
    lastPracticed: 0,
    totalMs: 0,
    dueAt: 0,
    confidentErrors: 0,
  };
}

function reviewDelay(attempt: Attempt, history: Attempt[]): number {
  if (!attempt.correct) return attempt.confidence >= 4 ? HOUR / 6 : HOUR;
  if (attempt.confidence <= 2) return 4 * HOUR;
  if (attempt.hints > 0) return 8 * HOUR;
  let streak = 1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const previous = history[index];
    if (previous.family !== attempt.family) continue;
    if (!previous.correct || previous.hints > 0 || previous.confidence <= 2)
      break;
    streak += 1;
    if (streak >= 4) break;
  }
  return [DAY, 3 * DAY, 7 * DAY, 14 * DAY][Math.min(streak, 4) - 1];
}

function studyDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function earnedXp(attempt: Attempt): number {
  return attempt.correct ? (attempt.hints === 0 ? 20 : 10) : 5;
}

export function recordAttempt(progress: Progress, attempt: Attempt): Progress {
  checkAttempt(attempt, "attempt");
  if (progress.attempts.some((previous) => previous.id === attempt.id))
    return progress;
  if (progress.attempts.length >= MAX_ATTEMPTS)
    throw new Error(
      "Attempt history limit reached. Export progress before continuing.",
    );
  const priorFamilyAttempt = progress.attempts.find(
    (previous) => previous.family === attempt.family,
  );
  if (priorFamilyAttempt && priorFamilyAttempt.topic !== attempt.topic) {
    throw new Error(`Challenge family ${attempt.family} cannot change topic.`);
  }
  const previous = progress.concepts[attempt.family] ?? emptyConcept();
  const concept: ConceptProgress = {
    attempts: previous.attempts + 1,
    correct: previous.correct + Number(attempt.correct),
    incorrect: previous.incorrect + Number(!attempt.correct),
    hints: previous.hints + attempt.hints,
    recent: [...previous.recent, attempt.correct].slice(-RECENT_COUNT),
    noHintAttempts: previous.noHintAttempts + Number(attempt.hints === 0),
    noHintCorrect:
      previous.noHintCorrect + Number(attempt.hints === 0 && attempt.correct),
    lastPracticed: attempt.at,
    totalMs: previous.totalMs + attempt.elapsedMs,
    dueAt: Math.min(
      MAX_DATE,
      attempt.at + reviewDelay(attempt, progress.attempts),
    ),
    confidentErrors:
      previous.confidentErrors +
      Number(!attempt.correct && attempt.confidence >= 4),
  };
  const day = studyDay(attempt.at);
  const nextProgress = {
    ...progress,
    xp: progress.xp + earnedXp(attempt),
    attempts: [...progress.attempts, { ...attempt }],
    concepts: { ...progress.concepts, [attempt.family]: concept },
    studyDays: progress.studyDays.includes(day)
      ? [...progress.studyDays]
      : [...progress.studyDays, day].sort(),
  };
  return applyAttemptSignal(nextProgress, attempt);
}

export function conceptStatus(
  concept?: ConceptProgress,
): "New" | "Needs work" | "Developing" | "Strong" {
  if (!concept || concept.attempts === 0) return "New";
  const accuracy =
    concept.recent.filter(Boolean).length / concept.recent.length;
  if (concept.recent.at(-1) === false || accuracy < 0.6) return "Needs work";
  if (
    concept.attempts >= 8 &&
    accuracy >= 7 / 8 &&
    concept.noHintAttempts >= 4 &&
    concept.noHintCorrect / concept.noHintAttempts >= 0.8
  )
    return "Strong";
  return "Developing";
}

export function scaffoldFor(
  progress: Progress,
  challenge: Challenge,
): Scaffold {
  const history = progress.attempts
    .filter((attempt) => attempt.family === challenge.family)
    .slice(-RECENT_COUNT);
  const unaided = (attempt: Attempt) => attempt.correct && attempt.hints === 0;
  if (
    history.length === 8 &&
    history.filter(unaided).length >= 7 &&
    unaided(history[7])
  )
    return "independent";
  if (
    history.length >= 4 &&
    history.slice(-4).filter(unaided).length >= 3 &&
    unaided(history[history.length - 1])
  )
    return "light";
  return "guided";
}

export function phaseFor(
  progress: Progress,
): "foundation" | "fluency" | "exam-preparation" {
  const successful = progress.attempts.filter(
    (attempt) => attempt.correct && attempt.hints === 0,
  ).length;
  if (successful < 32) return "foundation";
  return successful < 100 ? "fluency" : "exam-preparation";
}

function uniqueBank(bank: Challenge[]): Challenge[] {
  const seen = new Set<string>();
  return bank.filter((challenge) => {
    if (seen.has(challenge.id)) return false;
    seen.add(challenge.id);
    return true;
  });
}

function requestedCount(count: number, available: number): number {
  return Number.isFinite(count)
    ? Math.max(0, Math.min(available, Math.floor(count)))
    : 0;
}

function normalizedWeights(
  bank: Challenge[],
  weights: Record<Topic, number>,
): Record<Topic, number> {
  const available = new Set(bank.map((challenge) => challenge.topic));
  const result = Object.fromEntries(
    TOPICS.map((topic) => [
      topic,
      available.has(topic) && Number.isFinite(weights[topic])
        ? Math.max(0, weights[topic])
        : 0,
    ]),
  ) as Record<Topic, number>;
  let sum = Object.values(result).reduce((total, weight) => total + weight, 0);
  if (sum === 0) {
    for (const topic of available) result[topic] = 1;
    sum = available.size;
  }
  if (sum > 0) for (const topic of TOPICS) result[topic] /= sum;
  return result;
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function nextTopic(
  candidates: Challenge[],
  weights: Record<Topic, number>,
  selected: Challenge[],
): Topic {
  const available = [
    ...new Set(candidates.map((challenge) => challenge.topic)),
  ];
  const counts = Object.fromEntries(
    TOPICS.map((topic) => [topic, 0]),
  ) as Record<Topic, number>;
  for (const challenge of selected) counts[challenge.topic] += 1;
  return available.sort((left, right) => {
    const deficit = (topic: Topic) =>
      weights[topic] * (selected.length + 1) - counts[topic];
    return deficit(right) - deficit(left);
  })[0];
}

export function createExam(
  bank: Challenge[],
  weights: Record<Topic, number>,
  count: number,
  seed: number,
): Challenge[] {
  const unique = uniqueBank(bank);
  const proportions = normalizedWeights(unique, weights);
  const random = randomGenerator(seed);
  let remaining = unique
    .filter((challenge) => proportions[challenge.topic] > 0)
    .map((challenge) => ({ challenge, rank: random() }))
    .sort((left, right) => left.rank - right.rank)
    .map((item) => item.challenge);
  const target = requestedCount(count, remaining.length);
  const selected: Challenge[] = [];
  const families = new Set<string>();
  while (selected.length < target) {
    const topic = nextTopic(remaining, proportions, selected);
    const candidates = remaining.filter(
      (challenge) => challenge.topic === topic,
    );
    const chosen =
      candidates.find((challenge) => !families.has(challenge.family)) ??
      candidates[0];
    selected.push(chosen);
    families.add(chosen.family);
    remaining = remaining.filter((challenge) => challenge.id !== chosen.id);
  }
  return selected;
}

export function selectMission(
  bank: Challenge[],
  progress: Progress,
  count: number,
  now = Date.now(),
): Challenge[] {
  const unique = uniqueBank(bank);
  const configured = normalizedWeights(unique, progress.settings.weights);
  const permitted = unique.filter(
    (challenge) => configured[challenge.topic] > 0,
  );
  const successful = progress.attempts.filter(
    (attempt) => attempt.correct && attempt.hints === 0,
  ).length;
  const maximumDifficulty = successful < 12 ? 1 : successful < 32 ? 2 : 3;
  const basic = permitted.filter(
    (challenge) => challenge.difficulty <= maximumDifficulty,
  );
  const eligible = basic.length ? basic : permitted;
  const weights = { ...progress.settings.weights };
  if (phaseFor(progress) === "foundation") {
    weights.variables *= 2;
    weights.strings *= 1.5;
    weights.conditionals *= 1.5;
    weights.exceptions *= 0.5;
    weights.other *= 0.5;
  }
  const proportions = normalizedWeights(eligible, weights);
  let remaining = eligible.filter(
    (challenge) => proportions[challenge.topic] > 0,
  );
  const target = requestedCount(count, remaining.length);
  const selected: Challenge[] = [];
  const families = new Set<string>();
  const lastByFamily = new Map<string, Attempt>();
  for (const attempt of progress.attempts)
    lastByFamily.set(attempt.family, attempt);
  const tieBreak = randomGenerator(
    progress.attempts.length + progress.sessions * 997,
  );
  const ranks = new Map(
    remaining.map((challenge) => [challenge.id, tieBreak()]),
  );

  const need = (challenge: Challenge): number => {
    const concept = progress.concepts[challenge.family];
    if (!concept) return 2;
    const latest = lastByFamily.get(challenge.family);
    const overdue =
      concept.dueAt <= now ? 4 + Math.min(2, (now - concept.dueAt) / DAY) : -2;
    return (
      overdue +
      (latest?.correct === false ? 4 : 0) +
      (latest && !latest.correct && latest.confidence >= 4 ? 3 : 0) +
      (latest && latest.confidence <= 2 ? 2 : 0) +
      (conceptStatus(concept) === "Strong" ? -3 : 0)
    );
  };
  const preferVariation = (pool: Challenge[]): Challenge[] => {
    const unused = pool.filter((challenge) => !families.has(challenge.family));
    const distinct = unused.length ? unused : pool;
    const alternatives = distinct.filter((challenge) => {
      const last = lastByFamily.get(challenge.family);
      return (
        last?.challengeId !== challenge.id ||
        !remaining.some(
          (other) =>
            other.family === challenge.family && other.id !== challenge.id,
        )
      );
    });
    return alternatives.length ? alternatives : distinct;
  };
  const add = (challenge: Challenge) => {
    selected.push(challenge);
    families.add(challenge.family);
    remaining = remaining.filter((item) => item.id !== challenge.id);
  };
  const byNeed = (left: Challenge, right: Challenge) =>
    need(right) - need(left) ||
    (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0);

  for (let slot = 0; slot < Math.ceil(target * 0.4); slot += 1) {
    const due = remaining.filter(
      (challenge) =>
        !families.has(challenge.family) &&
        progress.concepts[challenge.family]?.dueAt <= now,
    );
    if (!due.length) break;
    add(preferVariation(due).sort(byNeed)[0]);
  }
  while (selected.length < target) {
    const candidates = preferVariation(remaining);
    const topic = nextTopic(candidates, proportions, selected);
    add(
      candidates
        .filter((challenge) => challenge.topic === topic)
        .sort(byNeed)[0],
    );
  }
  return selected;
}

export function similarChallenge(
  bank: Challenge[],
  challenge: Challenge,
  excludedIds: string[],
): Challenge | undefined {
  const excluded = new Set([...excludedIds, challenge.id]);
  const candidates = bank.filter((item) => !excluded.has(item.id));
  return (
    candidates.find((item) => item.family === challenge.family) ??
    candidates.find(
      (item) =>
        item.topic === challenge.topic && item.subtopic === challenge.subtopic,
    ) ??
    candidates.find(
      (item) => item.topic === challenge.topic && item.type === challenge.type,
    )
  );
}

export function scoreExam(
  questions: Challenge[],
  answers: Record<string, string>,
): { score: number; topics: ExamResult["topics"] } {
  const topics: ExamResult["topics"] = {};
  const unique = uniqueBank(questions);
  let correct = 0;
  for (const question of unique) {
    const result = evaluate(question, answers[question.id] ?? "");
    correct += Number(result);
    const previous = topics[question.topic] ?? { correct: 0, total: 0 };
    topics[question.topic] = {
      correct: previous.correct + Number(result),
      total: previous.total + 1,
    };
  }
  return {
    score: unique.length ? Math.round((correct / unique.length) * 100) : 0,
    topics,
  };
}

export function topicSummary(
  progress: Progress,
  topic: Topic,
): ConceptProgress | undefined {
  const history = progress.attempts.filter(
    (attempt) => attempt.topic === topic,
  );
  if (!history.length) return undefined;
  const families = [...new Set(history.map((attempt) => attempt.family))];
  const concepts = families
    .map((family) => progress.concepts[family])
    .filter(Boolean);
  const result = emptyConcept();
  result.dueAt = Infinity;
  for (const concept of concepts) {
    result.attempts += concept.attempts;
    result.correct += concept.correct;
    result.incorrect += concept.incorrect;
    result.hints += concept.hints;
    result.noHintAttempts += concept.noHintAttempts;
    result.noHintCorrect += concept.noHintCorrect;
    result.lastPracticed = Math.max(
      result.lastPracticed,
      concept.lastPracticed,
    );
    result.totalMs += concept.totalMs;
    result.dueAt = Math.min(result.dueAt, concept.dueAt);
    result.confidentErrors += concept.confidentErrors;
  }
  result.recent = history
    .slice(-RECENT_COUNT)
    .map((attempt) => attempt.correct);
  return result;
}

function invalid(path: string): never {
  throw new Error(
    `Saved progress is invalid at ${path}. Your saved file has not been reset.`,
  );
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    invalid(path);
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).some(
      (key) => Object.hasOwn(Object.prototype, key) || key === "prototype",
    )
  )
    invalid(path);
  return result;
}

function number(
  value: unknown,
  path: string,
  max = Number.MAX_SAFE_INTEGER,
  min = 0,
  integer = true,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    invalid(path);
}

function text(
  value: unknown,
  path: string,
  max = 128,
  empty = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.length)
  )
    invalid(path);
}

function key(value: unknown, path: string): asserts value is string {
  text(value, path);
  if (Object.hasOwn(Object.prototype, value) || value === "prototype")
    invalid(path);
}

function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(path);
  return value;
}

function boolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") invalid(path);
}

function checkAttempt(value: unknown, path: string): asserts value is Attempt {
  const attempt = object(value, path);
  for (const name of ["id", "challengeId", "family"])
    key(attempt[name], `${path}.${name}`);
  if (!TOPICS.includes(attempt.topic as Topic)) invalid(`${path}.topic`);
  if (
    !["training", "baseline", "exam", "boss"].includes(attempt.mode as string)
  )
    invalid(`${path}.mode`);
  text(attempt.answer, `${path}.answer`, 4096, true);
  boolean(attempt.correct, `${path}.correct`);
  number(attempt.hints, `${path}.hints`, 100);
  number(attempt.confidence, `${path}.confidence`, 5, 1);
  number(attempt.elapsedMs, `${path}.elapsedMs`, 7 * DAY);
  number(attempt.at, `${path}.at`, MAX_DATE);
}

/** Throw an actionable error, preserving the caller's original data on failure. */
export function validateProgress(value: unknown): Progress {
  const progress = object(value, "root");
  if (progress.version !== 1) invalid("version");
  number(progress.startedAt, "startedAt", MAX_DATE);
  boolean(progress.onboardingComplete, "onboardingComplete");
  boolean(progress.baselineComplete, "baselineComplete");
  number(progress.xp, "xp");
  number(progress.sessions, "sessions");
  const days = array(progress.studyDays, "studyDays", MAX_ATTEMPTS);
  const uniqueDays = new Set<string>();
  for (const day of days) {
    text(day, "studyDays", 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      Number.isNaN(Date.parse(`${day}T12:00:00Z`)) ||
      new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day ||
      uniqueDays.has(day)
    )
      invalid("studyDays");
    uniqueDays.add(day);
  }
  const settings = object(progress.settings, "settings");
  number(settings.targetScore, "settings.targetScore", 100, 1);
  if (![6, 12, 20].includes(settings.sessionLength as number))
    invalid("settings.sessionLength");
  number(settings.textScale, "settings.textScale", 2, 0.75, false);
  const weights = object(settings.weights, "settings.weights");
  for (const topic of TOPICS)
    number(weights[topic], `settings.weights.${topic}`, 100, 0, false);
  if (!TOPICS.some((topic) => (weights[topic] as number) > 0))
    invalid("settings.weights");

  const flashcardsValue =
    progress.flashcards === undefined ? {} : object(progress.flashcards, "flashcards");
  const flashcards: Record<string, FlashcardState> = {};
  for (const [id, value] of Object.entries(flashcardsValue)) {
    const path = `flashcards.${id}`;
    key(id, `${path}.id`);
    const state = object(value, path);
    key(state.cardId, `${path}.cardId`);
    if (state.cardId !== id) invalid(`${path}.cardId`);
    if (!TOPICS.includes(state.topic as Topic)) invalid(`${path}.topic`);
    text(state.concept, `${path}.concept`, 256);
    number(state.firstSeen, `${path}.firstSeen`, MAX_DATE);
    number(state.lastReviewed, `${path}.lastReviewed`, MAX_DATE);
    number(state.nextDue, `${path}.nextDue`, MAX_DATE);
    for (const field of [
      "reviews",
      "againCount",
      "hardCount",
      "gotItCount",
    ] as const)
      number(state[field], `${path}.${field}`, MAX_ATTEMPTS);
    number(state.stage, `${path}.stage`, 5);
    number(state.intervalDays, `${path}.intervalDays`, 30);
    number(state.priority, `${path}.priority`, 100, 0, false);
    const typedState = state as unknown as FlashcardState;
    if (
      typedState.firstSeen > 0 &&
      typedState.lastReviewed < typedState.firstSeen
    )
      invalid(`${path}.lastReviewed`);
    if (
      typedState.reviews !==
      typedState.againCount + typedState.hardCount + typedState.gotItCount
    )
      invalid(`${path}.reviews`);
    flashcards[id] = typedState;
  }

  const attempts = array(progress.attempts, "attempts", MAX_ATTEMPTS);
  const ids = new Set<string>();
  const aggregates = new Map<string, ConceptProgress>();
  const familyTopics = new Map<string, Topic>();
  let xp = 0;
  for (const [index, attempt] of attempts.entries()) {
    checkAttempt(attempt, `attempts[${index}]`);
    if (ids.has(attempt.id)) invalid(`attempts[${index}].id`);
    ids.add(attempt.id);
    if (
      familyTopics.has(attempt.family) &&
      familyTopics.get(attempt.family) !== attempt.topic
    )
      invalid(`attempts[${index}].topic`);
    familyTopics.set(attempt.family, attempt.topic);
    const aggregate = aggregates.get(attempt.family) ?? emptyConcept();
    aggregate.attempts += 1;
    aggregate.correct += Number(attempt.correct);
    aggregate.incorrect += Number(!attempt.correct);
    aggregate.hints += attempt.hints;
    aggregate.recent = [...aggregate.recent, attempt.correct].slice(
      -RECENT_COUNT,
    );
    aggregate.noHintAttempts += Number(attempt.hints === 0);
    aggregate.noHintCorrect += Number(attempt.hints === 0 && attempt.correct);
    aggregate.lastPracticed = attempt.at;
    aggregate.totalMs += attempt.elapsedMs;
    aggregate.confidentErrors += Number(
      !attempt.correct && attempt.confidence >= 4,
    );
    aggregates.set(attempt.family, aggregate);
    xp += earnedXp(attempt);
  }
  if (progress.xp !== xp) invalid("xp");
  const concepts = object(progress.concepts, "concepts");
  if (Object.keys(concepts).length !== aggregates.size) invalid("concepts");
  for (const [family, expected] of aggregates) {
    const concept = object(concepts[family], `concepts.${family}`);
    for (const field of [
      "attempts",
      "correct",
      "incorrect",
      "hints",
      "noHintAttempts",
      "noHintCorrect",
      "lastPracticed",
      "totalMs",
      "confidentErrors",
    ] as const) {
      if (concept[field] !== expected[field])
        invalid(`concepts.${family}.${field}`);
    }
    const recent = array(
      concept.recent,
      `concepts.${family}.recent`,
      RECENT_COUNT,
    );
    if (
      recent.length !== expected.recent.length ||
      recent.some((result, index) => result !== expected.recent[index])
    )
      invalid(`concepts.${family}.recent`);
    number(
      concept.dueAt,
      `concepts.${family}.dueAt`,
      Math.min(MAX_DATE, expected.lastPracticed + 14 * DAY),
      expected.lastPracticed,
    );
  }

  const exams = array(progress.exams, "exams", 10_000);
  const examIds = new Set<string>();
  for (const [index, value] of exams.entries()) {
    const path = `exams[${index}]`;
    const exam = object(value, path);
    key(exam.id, `${path}.id`);
    if (examIds.has(exam.id)) invalid(`${path}.id`);
    examIds.add(exam.id);
    if (!["baseline", "exam"].includes(exam.kind as string))
      invalid(`${path}.kind`);
    number(exam.at, `${path}.at`, MAX_DATE);
    number(exam.elapsedMs, `${path}.elapsedMs`, 7 * DAY);
    number(exam.score, `${path}.score`, 100);
    const questions = array(exam.challengeIds, `${path}.challengeIds`, 1000);
    const questionIds = new Set<string>();
    for (const id of questions) {
      key(id, `${path}.challengeIds`);
      if (questionIds.has(id)) invalid(`${path}.challengeIds`);
      questionIds.add(id);
    }
    const answers = object(exam.answers, `${path}.answers`);
    for (const [id, answer] of Object.entries(answers)) {
      if (!questionIds.has(id)) invalid(`${path}.answers`);
      text(answer, `${path}.answers.${id}`, 4096, true);
    }
    const breakdown = object(exam.topics, `${path}.topics`);
    let total = 0;
    let correct = 0;
    for (const [topic, value] of Object.entries(breakdown)) {
      if (!TOPICS.includes(topic as Topic)) invalid(`${path}.topics`);
      const entry = object(value, `${path}.topics.${topic}`);
      number(entry.total, `${path}.topics.${topic}.total`, questions.length, 1);
      number(entry.correct, `${path}.topics.${topic}.correct`, entry.total);
      total += entry.total;
      correct += entry.correct;
    }
    if (
      total !== questions.length ||
      exam.score !== (total ? Math.round((correct / total) * 100) : 0)
    )
      invalid(`${path}.score`);
  }
  if (progress.activeAssessment !== undefined) {
    const active = object(progress.activeAssessment, "activeAssessment");
    key(active.id, "activeAssessment.id");
    if (
      !["baseline", "exam"].includes(active.mode as string) ||
      examIds.has(active.id)
    )
      invalid("activeAssessment.mode");
    number(active.startedAt, "activeAssessment.startedAt", MAX_DATE);
    if (active.mode === "baseline") {
      if (active.deadline !== null) invalid("activeAssessment.deadline");
    } else {
      number(
        active.deadline,
        "activeAssessment.deadline",
        Math.min(MAX_DATE, active.startedAt + 7 * DAY),
        active.startedAt + 1,
      );
    }
    const questions = array(active.ids, "activeAssessment.ids", 1000);
    if (!questions.length) invalid("activeAssessment.ids");
    const questionIds = new Set<string>();
    for (const id of questions) {
      key(id, "activeAssessment.ids");
      if (questionIds.has(id)) invalid("activeAssessment.ids");
      questionIds.add(id);
    }
    number(active.index, "activeAssessment.index", questions.length - 1);
    for (const field of ["answers", "confidences", "times"] as const) {
      const entries = object(active[field], `activeAssessment.${field}`);
      for (const [id, value] of Object.entries(entries)) {
        if (!questionIds.has(id)) invalid(`activeAssessment.${field}`);
        if (field === "answers")
          text(value, `activeAssessment.answers.${id}`, 4096, true);
        else if (field === "confidences")
          number(value, `activeAssessment.confidences.${id}`, 5, 1);
        else number(value, `activeAssessment.times.${id}`, 7 * DAY);
      }
    }
  }
  const normalized = structuredClone(value as Progress);
  normalized.flashcards = flashcards;
  return normalized;
}
