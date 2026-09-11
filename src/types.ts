export type Topic =
  | "variables"
  | "strings"
  | "conditionals"
  | "collections"
  | "loops"
  | "functions"
  | "exceptions"
  | "other";
export type ChallengeType =
  | "predict-output"
  | "next-line"
  | "variable-value"
  | "condition"
  | "function-return"
  | "find-bug"
  | "repair"
  | "fill-line"
  | "order-lines"
  | "collection-state"
  | "exception"
  | "traceback"
  | "scope"
  | "test-input"
  | "loop-count";
export interface Choice {
  id: string;
  text: string;
  feedback?: string;
}
export interface Challenge {
  id: string;
  family: string;
  topic: Topic;
  subtopic: string;
  difficulty: 1 | 2 | 3;
  type: ChallengeType;
  title: string;
  code: string;
  displayCode?: string;
  question: string;
  choices: Choice[];
  answer: string;
  explanation: string;
  misconception: string;
  hints: string[];
  traceEnabled: boolean;
  focusLine?: number;
  expectedOutput?: string;
  expectedException?: string;
  order?: string[];
  repair?: {
    line: number;
    choices: Choice[];
    answer: string;
    code: string;
    expectedOutput: string;
  };
}
export interface TopicInfo {
  id: Topic;
  name: string;
  description: string;
  phase: 1 | 2;
}
export type Mode = "training" | "baseline" | "exam" | "boss";
export type Scaffold = "guided" | "light" | "independent";
export interface Attempt {
  id: string;
  challengeId: string;
  family: string;
  topic: Topic;
  answer: string;
  correct: boolean;
  hints: number;
  confidence: number;
  elapsedMs: number;
  at: number;
  mode: Mode;
}
export interface ConceptProgress {
  attempts: number;
  correct: number;
  incorrect: number;
  hints: number;
  recent: boolean[];
  noHintAttempts: number;
  noHintCorrect: number;
  lastPracticed: number;
  totalMs: number;
  dueAt: number;
  confidentErrors: number;
}
export interface ExamResult {
  id: string;
  kind: "baseline" | "exam";
  at: number;
  elapsedMs: number;
  challengeIds: string[];
  answers: Record<string, string>;
  score: number;
  topics: Partial<Record<Topic, { correct: number; total: number }>>;
}
export interface Settings {
  targetScore: number;
  sessionLength: 6 | 12 | 20;
  textScale: number;
  weights: Record<Topic, number>;
}
export type FlashcardType = "concept" | "code";
export type FlashcardRating = "again" | "hard" | "got-it";
export interface Flashcard {
  id: string;
  topic: Topic;
  concept: string;
  type: FlashcardType;
  difficulty: 1 | 2 | 3;
  front: string;
  answer: string;
  explanation: string;
  code?: string;
  output?: string;
  relatedMisconceptions: string[];
  relatedChallengeIds: string[];
}
export interface FlashcardState {
  cardId: string;
  topic: Topic;
  concept: string;
  firstSeen: number;
  lastReviewed: number;
  nextDue: number;
  reviews: number;
  againCount: number;
  hardCount: number;
  gotItCount: number;
  stage: number;
  intervalDays: number;
  priority: number;
}
export interface ActiveAssessment {
  id: string;
  mode: "baseline" | "exam";
  ids: string[];
  answers: Record<string, string>;
  confidences: Record<string, number>;
  times: Record<string, number>;
  startedAt: number;
  deadline: number | null;
  index: number;
}
export interface Progress {
  version: 1;
  startedAt: number;
  onboardingComplete: boolean;
  baselineComplete: boolean;
  xp: number;
  sessions: number;
  studyDays: string[];
  concepts: Record<string, ConceptProgress>;
  attempts: Attempt[];
  exams: ExamResult[];
  settings: Settings;
  flashcards: Record<string, FlashcardState>;
  activeAssessment?: ActiveAssessment;
}
export interface TraceChange {
  name: string;
  before: string | null;
  after: string | null;
}
export interface TraceFrame {
  function: string;
  line: number;
  locals: Record<string, string>;
}
export interface TraceEvent {
  step: number;
  event: "line" | "call" | "return" | "exception" | "branch" | "loop";
  line: number;
  function: string;
  locals: Record<string, string>;
  globals: Record<string, string>;
  changes: TraceChange[];
  output: string;
  stack: TraceFrame[];
  detail: string;
  decision?: boolean;
  iteration?: number;
  parameters?: Record<string, string>;
  returnValue?: string;
}
export interface TraceResult {
  events: TraceEvent[];
  output: string;
  error: { type: string; message: string; line: number } | null;
  truncated: boolean;
}
