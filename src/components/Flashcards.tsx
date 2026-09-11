import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Clock3,
  Layers3,
  RotateCcw,
  Target,
} from "lucide-react";
import { flashcards, flashcardValidationErrors, topics } from "../content";
import {
  flashcardPriority,
  flashcardStats,
  flashcardKeyboardAction,
  needsWorkFlashcards,
  rateFlashcard,
  selectFlashcards,
} from "../core/flashcards";
import type {
  Flashcard,
  FlashcardRating,
  Progress,
  Topic,
} from "../types";
import { CodeBlock } from "./CodeBlock";

const SESSION_SIZE = 12;
type Mode = "recommended" | "needs-work" | "all";
type TopicFilter = "all" | Topic;

interface ReviewSession {
  cards: Flashcard[];
  index: number;
  reviewed: number;
  again: number;
  hard: number;
  gotIt: number;
  requeued: string[];
  priorityConcepts: string[];
  mode: Mode;
  topic: TopicFilter;
}

interface ReviewSummary {
  reviewed: number;
  again: number;
  hard: number;
  gotIt: number;
  priorityConcepts: string[];
}

interface Props {
  progress: Progress;
  onUpdate: (fn: (progress: Progress) => Progress) => void;
  onHome: () => void;
}

const modeLabels: Record<Mode, string> = {
  recommended: "Recommended",
  "needs-work": "Needs Work",
  all: "All Cards",
};

function topicName(topic: Topic | null): string {
  return topics.find((item) => item.id === topic)?.name ?? "—";
}

function estimateMinutes(count: number): number {
  return Math.max(1, Math.ceil(count / 2));
}

function modeDescription(mode: Mode): string {
  if (mode === "recommended") return "Due first, with the most important gaps at the top.";
  if (mode === "needs-work") return "Cards promoted by mistakes, uncertainty, or repeated effort.";
  return "The full bank, useful when you want an unfiltered pass.";
}

export function Flashcards({ progress, onUpdate, onHome }: Props) {
  const [mode, setMode] = useState<Mode>("recommended");
  const [topic, setTopic] = useState<TopicFilter>("all");
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");

  const stats = flashcardStats(flashcards, progress);
  const recommended = selectFlashcards(
    flashcards,
    progress,
    "recommended",
    "all",
    Date.now(),
    SESSION_SIZE,
  );
  const filtered = selectFlashcards(
    flashcards,
    progress,
    mode,
    topic,
    Date.now(),
    flashcards.length,
  );
  const weakCards = needsWorkFlashcards(flashcards, progress);

  function startSession(nextMode = mode, nextTopic = topic) {
    const cards = selectFlashcards(
      flashcards,
      progress,
      nextMode,
      nextTopic,
      Date.now(),
      SESSION_SIZE,
    );
    if (!cards.length) {
      setError(
        nextMode === "recommended"
          ? "There are no cards due in this topic yet. Try Needs Work or All Cards for an optional pass."
          : "No cards match this review filter yet. Try another topic or mode.",
      );
      setSession(null);
      setSummary(null);
      return;
    }
    setError("");
    setSummary(null);
    setRevealed(false);
    setSession({
      cards,
      index: 0,
      reviewed: 0,
      again: 0,
      hard: 0,
      gotIt: 0,
      requeued: [],
      priorityConcepts: [],
      mode: nextMode,
      topic: nextTopic,
    });
  }

  function leaveSession() {
    setSession(null);
    setRevealed(false);
    setError("");
  }

  function rate(rating: FlashcardRating) {
    if (!session) return;
    const card = session.cards[session.index];
    if (!card) return;
    const now = Date.now();
    onUpdate((current) => ({
      ...current,
      flashcards: {
        ...current.flashcards,
        [card.id]: rateFlashcard(current, card, rating, now),
      },
    }));
    const nextCards = session.cards.slice();
    const nextRequeued = [...session.requeued];
    if (rating === "again" && !nextRequeued.includes(card.id)) {
      nextCards.push(card);
      nextRequeued.push(card.id);
    }
    const nextReviewed = session.reviewed + 1;
    const nextCounts = {
      again: session.again + Number(rating === "again"),
      hard: session.hard + Number(rating === "hard"),
      gotIt: session.gotIt + Number(rating === "got-it"),
    };
    const priorityConcepts =
      rating === "got-it" || session.priorityConcepts.includes(card.concept)
        ? session.priorityConcepts
        : [...session.priorityConcepts, card.concept].slice(-3);
    if (session.index >= nextCards.length - 1) {
      setSession(null);
      setRevealed(false);
      setSummary({
        reviewed: nextReviewed,
        ...nextCounts,
        priorityConcepts,
      });
      return;
    }
    setRevealed(false);
    setSession({
      ...session,
      cards: nextCards,
      index: session.index + 1,
      reviewed: nextReviewed,
      ...nextCounts,
      requeued: nextRequeued,
      priorityConcepts,
    });
  }

  function continueReviewing() {
    const nextMode: Mode = weakCards.length ? "needs-work" : "all";
    startSession(nextMode, "all");
  }

  if (session) {
    return (
      <FlashcardStudy
        progress={progress}
        session={session}
        revealed={revealed}
        setRevealed={setRevealed}
        onRate={rate}
        onExit={leaveSession}
      />
    );
  }
  if (summary) {
    return (
      <FlashcardSummary
        summary={summary}
        onHome={onHome}
        onContinue={continueReviewing}
      />
    );
  }

  const priorityCard = recommended[0] ?? weakCards[0];
  const priorityLabel = priorityCard?.concept ?? topicName(stats.priorityTopic);
  const startMode: Mode = stats.due ? "recommended" : stats.needsWork ? "needs-work" : "recommended";
  const startLabel = stats.due
    ? "Start recommended review"
    : stats.needsWork
      ? "Review needs work"
      : "You're caught up";

  return (
    <div className="flashcards-screen">
      <div className="page-heading flashcards-heading">
        <div>
          <span className="eyebrow">
            <BrainCircuit size={15} /> RETRIEVAL PRACTICE
          </span>
          <h1>Flashcards.</h1>
          <p>Lock in what you’ve learned.</p>
        </div>
        <button
          className="primary flashcard-start-heading"
          onClick={() => startSession(startMode, "all")}
          disabled={!stats.due && !stats.needsWork}
        >
          {startLabel}
          <ArrowRight size={18} />
        </button>
      </div>

      {flashcardValidationErrors.length > 0 && (
        <div className="notice error" role="alert">
          <span>
            Flashcard content needs attention. Invalid cards are being withheld
            from review: {flashcardValidationErrors.join("; ")}
          </span>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <section className="flashcard-overview" aria-label="Flashcard review summary">
        <div className="flashcard-overview-lead">
          <span className="eyebrow">YOUR NEXT RETENTION PASS</span>
          <h2>
            {stats.due ? "The next few minutes are clear." : "Your due queue is clear."}
          </h2>
          <p>
            {stats.due
              ? `Start with ${priorityLabel === "—" ? "the most important gaps" : priorityLabel}. No setup required.`
              : stats.needsWork
                ? "Nothing is due right now. You can still reinforce the concepts that have needed the most effort."
                : "New review cards will appear after you work through more of the curriculum."}
          </p>
          <button
            className="primary start-cta"
            onClick={() => startSession(startMode, "all")}
            disabled={!stats.due && !stats.needsWork}
          >
            {startLabel}
            <ArrowRight size={19} />
          </button>
        </div>
        <div className="flashcard-summary-stats">
          <div>
            <span>Due now</span>
            <b>{stats.due}</b>
            <small>{stats.due ? `${recommended.length} in the first pass` : "Next cards arrive on schedule"}</small>
          </div>
          <div>
            <span>Estimated time</span>
            <b>{stats.due ? `~${estimateMinutes(recommended.length)}` : "—"}</b>
            <small>{stats.due ? "minutes for recommended" : "No required review"}</small>
          </div>
          <div>
            <span>Priority topic</span>
            <b className="flashcard-stat-topic">{topicName(stats.priorityTopic)}</b>
            <small>{stats.needsWork} cards need more work</small>
          </div>
          <div>
            <span>Weak concepts</span>
            <b>{stats.weakConcepts}</b>
            <small>linked to recent effort</small>
          </div>
        </div>
      </section>

      <section className="flashcard-filter-section">
        <div className="section-heading">
          <div>
            <h2>Choose a review lens</h2>
            <p>Recommended is the default. The queue stays tied to your history.</p>
          </div>
          <span>{filtered.length} cards in this view</span>
        </div>
        <div className="flashcard-controls">
          <div className="flashcard-modes" role="group" aria-label="Flashcard mode">
            {(Object.keys(modeLabels) as Mode[]).map((item) => (
              <button
                key={item}
                className={mode === item ? "active" : ""}
                aria-pressed={mode === item}
                onClick={() => {
                  setMode(item);
                  setError("");
                }}
              >
                {modeLabels[item]}
              </button>
            ))}
          </div>
          <label className="flashcard-topic-filter">
            <span>Topic</span>
            <select
              aria-label="Flashcard topic"
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value as TopicFilter);
                setError("");
              }}
            >
              <option value="all">All Topics</option>
              {topics.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary flashcard-filter-start"
            onClick={() => startSession(mode, topic)}
            disabled={!filtered.length}
          >
            Review this view
            <ArrowRight size={16} />
          </button>
        </div>
        <p className="flashcard-mode-note">
          <Layers3 size={16} /> {modeDescription(mode)}
        </p>
        {!filtered.length && (
          <div className="flashcard-empty-filter">
            <RotateCcw size={22} />
            <div>
              <h3>No cards match this view yet.</h3>
              <p>
                Try All Topics, or keep practicing in the Training Deck. Missed
                concepts will promote their linked cards here.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="flashcard-principles">
        <div>
          <Clock3 size={19} />
          <div>
            <h3>Short, spaced passes</h3>
            <p>Again returns soon. Hard comes back sooner than a mastered card. Got It earns more distance.</p>
          </div>
        </div>
        <div>
          <Target size={19} />
          <div>
            <h3>Built from your practice</h3>
            <p>Training mistakes and submitted exam misses raise the priority of their related fundamentals.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function FlashcardStudy({
  progress,
  session,
  revealed,
  setRevealed,
  onRate,
  onExit,
}: {
  progress: Progress;
  session: ReviewSession;
  revealed: boolean;
  setRevealed: (value: boolean) => void;
  onRate: (rating: FlashcardRating) => void;
  onExit: () => void;
}) {
  const surface = useRef<HTMLElement>(null);
  const card = session.cards[session.index];
  const modeLabel = modeLabels[session.mode];
  useEffect(() => {
    setRevealed(false);
    requestAnimationFrame(() => surface.current?.focus());
  }, [card?.id, setRevealed]);

  if (!card) return null;
  const status = flashcardPriority(progress, card);
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, input, textarea, select, [contenteditable='true']")
    )
      return;
    const action = flashcardKeyboardAction(
      event.key,
      revealed,
      Boolean(
        event.target instanceof HTMLElement &&
          event.target.closest(
            "button, input, textarea, select, [contenteditable='true']",
          ),
      ),
    );
    if (action === "reveal") {
      event.preventDefault();
      setRevealed(true);
    } else if (action) {
      event.preventDefault();
      onRate(action);
    }
  }
  return (
    <div className="flashcard-session-screen">
      <div className="flashcard-session-header">
        <button className="ghost" onClick={onExit}>
          Return to flashcards
        </button>
        <span className="eyebrow">{modeLabel.toUpperCase()} · RETRIEVAL FIRST</span>
        <span className="flashcard-session-count">
          CARD {session.index + 1} / {session.cards.length}
        </span>
      </div>
      <div className="flashcard-session-track" aria-label="Review progress">
        {session.cards.map((item, index) => (
          <span
            key={`${item.id}-${index}`}
            className={index < session.index ? "complete" : index === session.index ? "current" : ""}
          />
        ))}
      </div>
      <section
        ref={surface}
        className={`flashcard-study-surface ${revealed ? "revealed" : ""}`}
        tabIndex={0}
        aria-label="Flashcard study surface"
        onKeyDown={handleKeyDown}
      >
        <div className="flashcard-card-heading">
          <span className="topic-bar">
            <span>
              <span className="topic-symbol">{topicIconFor(card.topic)}</span>
              {topicName(card.topic)}
            </span>
            <span>{card.type === "code" ? "CODE READING" : "CONCEPT RECALL"}</span>
          </span>
          <span className="flashcard-card-concept">{card.concept}</span>
          {status > 0 && <span className="flashcard-priority">PRIORITY {status}</span>}
        </div>
        <div className="flashcard-prompt">
          <span className="eyebrow">THINK BEFORE YOU REVEAL</span>
          <h1>{card.front}</h1>
        </div>
        {card.code && <CodeBlock code={card.code} label="flashcard.py" />}
        {!revealed ? (
          <div className="flashcard-reveal-area">
            <button
              className="primary flashcard-reveal"
              onClick={() => setRevealed(true)}
            >
              Show answer
              <kbd>SPACE</kbd>
            </button>
            <span>Commit to your answer first. The back stays hidden until you ask for it.</span>
          </div>
        ) : (
          <div className="flashcard-answer-area" aria-live="polite">
            <div className="flashcard-answer">
              <span className="eyebrow">ANSWER</span>
              <p className="flashcard-answer-text">{card.answer}</p>
              {card.output !== undefined && (
                <div className="flashcard-output">
                  <span>OUTPUT</span>
                  <pre>{card.output || "(no output)"}</pre>
                </div>
              )}
              <p className="flashcard-explanation">{card.explanation}</p>
            </div>
            <div className="flashcard-rating-area">
              <span className="eyebrow">HOW DID THAT RECALL FEEL?</span>
              <div className="flashcard-ratings" role="group" aria-label="Rate this flashcard">
                <button className="again" onClick={() => onRate("again")}>
                  <span className="rating-key">1</span>
                  <b>Again</b>
                  <small>Return soon</small>
                </button>
                <button className="hard" onClick={() => onRate("hard")}>
                  <span className="rating-key">2</span>
                  <b>Hard</b>
                  <small>Bring it back sooner</small>
                </button>
                <button className="got-it" onClick={() => onRate("got-it")}>
                  <span className="rating-key">3</span>
                  <b>Got It</b>
                  <small>Space it farther out</small>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function FlashcardSummary({
  summary,
  onHome,
  onContinue,
}: {
  summary: ReviewSummary;
  onHome: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flashcard-session-summary">
      <div className="summary-mark">
        <Check size={48} />
      </div>
      <span className="eyebrow">REVIEW COMPLETE</span>
      <h1>That knowledge has somewhere to land.</h1>
      <p>
        {summary.reviewed} card{summary.reviewed === 1 ? "" : "s"} reviewed.
        Keep the misses visible, then let spacing do its work.
      </p>
      <div className="flashcard-review-summary-stats">
        <div>
          <b>{summary.gotIt}</b>
          <span>Got It</span>
        </div>
        <div>
          <b>{summary.hard}</b>
          <span>Hard</span>
        </div>
        <div>
          <b>{summary.again}</b>
          <span>Again</span>
        </div>
      </div>
      <div className="flashcard-summary-note">
        <BrainCircuit size={20} />
        <div>
          <b>Priority concepts to keep an eye on</b>
          <span>
            {summary.priorityConcepts.length
              ? summary.priorityConcepts.join(" · ")
              : "Nothing was flagged in this pass."}
          </span>
        </div>
      </div>
      <div className="actions">
        <button className="primary" onClick={onHome}>
          Return to Mission Control
          <ArrowRight size={18} />
        </button>
        <button className="ghost" onClick={onContinue}>
          Continue reviewing
        </button>
      </div>
    </div>
  );
}

function topicIconFor(topic: Topic): string {
  return {
    variables: "x =",
    strings: '" "',
    conditionals: "if",
    collections: "[ ]",
    loops: "↻",
    functions: "ƒ",
    exceptions: "! ",
    other: "{ }",
  }[topic];
}
