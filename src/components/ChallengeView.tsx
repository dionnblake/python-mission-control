import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  Check,
  CircleHelp,
  Cpu,
  Lightbulb,
  LockKeyhole,
  ShieldCheck,
  Wrench,
  X,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type { Attempt, Challenge, Scaffold, TraceResult } from "../types";
import { CodeBlock } from "./CodeBlock";
import { PythonMachine } from "./PythonMachine";
import { runTrace } from "../bridge";

const typeNames: Record<string, string> = {
  "predict-output": "Predict the output",
  "next-line": "Follow the execution",
  "variable-value": "Track a variable",
  condition: "Read the condition",
  "function-return": "Follow the return",
  "find-bug": "Find the bug",
  repair: "Repair the code",
  "fill-line": "Complete the code",
  "order-lines": "Arrange the code",
  "collection-state": "Track the collection",
  exception: "Identify the exception",
  traceback: "Read the traceback",
  scope: "Track the scope",
  "test-input": "Expose the bug",
  "loop-count": "Count the iterations",
};
export function answerLabel(challenge: Challenge, answer: string) {
  if (challenge.type === "order-lines")
    return answer
      .split("|")
      .map((id) => challenge.choices.find((c) => c.id === id)?.text || id)
      .join("\n");
  return (
    challenge.choices.find((c) => c.id === answer)?.text ??
    (answer || "Unanswered")
  );
}
interface Props {
  challenge: Challenge;
  index: number;
  total: number;
  scaffold: Scaffold;
  boss?: boolean;
  onLock: (
    answer: string,
    hints: number,
    confidence: number,
    elapsedMs: number,
  ) => void;
  onRepair: (answer: string, correct: boolean, elapsedMs: number) => void;
  initialAttempt?: Attempt;
  initialHintCount: number;
  onHintCount: (count: number) => void;
  hadRepair: boolean;
  onContinue: () => void;
  followupAvailable: boolean;
  isFollowup?: boolean;
}
export function ChallengeView({
  challenge,
  index,
  total,
  scaffold,
  boss,
  onLock,
  onContinue,
  onRepair,
  initialAttempt,
  initialHintCount,
  onHintCount,
  hadRepair,
  followupAvailable,
  isFollowup,
}: Props) {
  const [selected, setSelected] = useState(initialAttempt?.answer || "");
  const [order, setOrder] = useState(
    initialAttempt && challenge.type === "order-lines"
      ? initialAttempt.answer.split("|")
      : challenge.choices.map((c) => c.id),
  );
  const [confidence, setConfidence] = useState(initialAttempt?.confidence ?? 3);
  const [hints, setHints] = useState(initialAttempt?.hints ?? initialHintCount);
  const [locked, setLocked] = useState(Boolean(initialAttempt));
  const [machine, setMachine] = useState(false);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [repairAnswer, setRepairAnswer] = useState("");
  const [repairResult, setRepairResult] = useState<{
    correct: boolean;
    trace: TraceResult;
    code: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);
  const lockRef = useRef(Boolean(initialAttempt));
  const repairStart = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const answer = challenge.type === "order-lines" ? order.join("|") : selected;
  const correct = answer === challenge.answer;
  const faded = scaffold === "independent";
  const hintAllowed = scaffold === "guided";
  useEffect(() => {
    heading.current?.focus();
  }, []);

  function commit() {
    if (!answer || lockRef.current) return;
    lockRef.current = true;
    onLock(answer, hints, confidence, Date.now() - startedAt.current);
    setLocked(true);
    setShowExplanation(scaffold === "guided" && !boss);
  }
  function nextHint() {
    const next = Math.min(hints + 1, challenge.hints.length);
    setHints(next);
    onHintCount(next);
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        (e.target instanceof Element &&
          e.target.closest(
            'input, textarea, select, button, [contenteditable="true"]',
          ))
      )
        return;
      if (
        !locked &&
        /^[1-4]$/.test(e.key) &&
        challenge.type !== "order-lines"
      ) {
        setSelected(challenge.choices[Number(e.key) - 1]?.id || "");
      }
      if (e.key.toLowerCase() === "h" && !locked && hintAllowed) {
        e.preventDefault();
        nextHint();
      }
      if (e.key === "Enter" && !machine && !busy) {
        e.preventDefault();
        if (locked) continueSafely();
        else commit();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function execute() {
    setBusy(true);
    setError("");
    try {
      const result = trace || (await runTrace(challenge.code));
      setTrace(result);
      setMachine(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function verifyRepair() {
    if (!challenge.repair || !repairAnswer) return;
    setBusy(true);
    setError("");
    const repair = challenge.repair;
    const selectedChoice = repair.choices.find((c) => c.id === repairAnswer)!;
    const lines = challenge.code.split("\n");
    const indentation = lines[repair.line - 1].match(/^\s*/)?.[0] || "";
    lines[repair.line - 1] = indentation + selectedChoice.text.trimStart();
    const code =
      repairAnswer === repair.answer ? repair.code : lines.join("\n");
    try {
      const result = await runTrace(code);
      const valid =
        repairAnswer === repair.answer &&
        !result.error &&
        !result.truncated &&
        result.output.trim() === repair.expectedOutput.trim();
      setRepairResult({ correct: valid, trace: result, code });
      onRepair(repairAnswer, valid, Date.now() - repairStart.current);
      repairStart.current = Date.now();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function continueSafely() {
    if (busy) return;
    if (challenge.repair && !hadRepair)
      onRepair("skipped", false, Date.now() - repairStart.current);
    onContinue();
  }
  const distractor = challenge.choices.find((c) => c.id === answer)?.feedback;
  return (
    <div className={`challenge-screen ${machine ? "machine-open" : ""}`}>
      <div className="challenge-top">
        <div>
          <span className="eyebrow">
            {boss
              ? "DEBUGGING INCIDENT"
              : isFollowup
                ? "RELATED FOLLOW-UP"
                : "TODAY’S MISSION"}{" "}
            <span className="accent">
              {String(index + 1).padStart(2, "0")} /{" "}
              {String(total).padStart(2, "0")}
            </span>
          </span>
          <h1 ref={heading} tabIndex={-1}>
            {challenge.title}
          </h1>
        </div>
        <div className="mode-label">
          <span className="status-dot" />
          {scaffold === "guided"
            ? "Guided training"
            : scaffold === "light"
              ? "Reduced assistance"
              : "Independent practice"}
        </div>
      </div>
      <div
        className="session-track"
        aria-label={`Challenge ${index + 1} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={i < index ? "complete" : i === index ? "current" : ""}
          />
        ))}
      </div>
      {machine && (
        <div className="machine-review-bar">
          <span className={correct ? "correct" : "incorrect"}>
            {correct ? <Check size={17} /> : <CircleHelp size={17} />}
            <b>{correct ? "Prediction confirmed" : "Trace your prediction"}</b>
            <span>{challenge.question}</span>
          </span>
          <button
            className="secondary"
            onClick={() => {
              setMachine(false);
              setShowExplanation(true);
            }}
          >
            Back to explanation
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <div className="challenge-workspace">
        <div className="challenge-code">
          <div className="topic-bar">
            <span>
              {challenge.topic.toUpperCase()}
              <ChevronRight size={13} />
              {challenge.subtopic}
            </span>
            <span>{typeNames[challenge.type]}</span>
          </div>
          <CodeBlock
            code={
              locked ? challenge.code : challenge.displayCode || challenge.code
            }
            focusLine={
              locked && showExplanation ? challenge.focusLine : undefined
            }
          />
          {!locked && (
            <div className="reading-tip">
              <LockKeyhole size={16} />
              <span>
                {faded
                  ? "Use your scratchpad. This round builds independence."
                  : "Your prediction comes first. Execution unlocks after your answer."}
              </span>
            </div>
          )}
          {!locked && (
            <label className="scratchpad-label">
              {faded ? "Scratchpad" : "Think it through"}
              <textarea
                className="scratchpad"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What changes, and in what order? Optional notes…"
                rows={3}
              />
            </label>
          )}
        </div>
        <div className="answer-panel">
          {!locked ? (
            <>
              <span className="eyebrow">PREDICT BEFORE YOU RUN</span>
              <h2>{challenge.question}</h2>
              {challenge.type === "order-lines" ? (
                <div className="order-choices" aria-label="Arrange the lines">
                  {order.map((id, i) => (
                    <div className="order-line" key={id}>
                      <span className="order-number">{i + 1}</span>
                      <code>
                        {challenge.choices.find((c) => c.id === id)?.text}
                      </code>
                      <div>
                        <button
                          className="icon-button"
                          disabled={i === 0}
                          aria-label={`Move line ${i + 1} up`}
                          onClick={() =>
                            setOrder((o) => {
                              const a = [...o];
                              [a[i], a[i - 1]] = [a[i - 1], a[i]];
                              return a;
                            })
                          }
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={i === order.length - 1}
                          aria-label={`Move line ${i + 1} down`}
                          onClick={() =>
                            setOrder((o) => {
                              const a = [...o];
                              [a[i], a[i + 1]] = [a[i + 1], a[i]];
                              return a;
                            })
                          }
                        >
                          <ArrowDown size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="choices"
                  role="group"
                  aria-label="Answer choices"
                >
                  {challenge.choices.map((choice, i) => (
                    <button
                      key={choice.id}
                      aria-pressed={selected === choice.id}
                      className={`choice ${selected === choice.id ? "selected" : ""}`}
                      onClick={() => setSelected(choice.id)}
                    >
                      <span className="choice-key">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <code>{choice.text}</code>
                      {selected === choice.id && <Check size={18} />}
                    </button>
                  ))}
                </div>
              )}
              <div className="confidence">
                <span>How sure are you?</span>
                <div role="group" aria-label="Confidence">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      aria-label={`Confidence ${n} of 5`}
                      aria-pressed={confidence === n}
                      className={confidence === n ? "active" : ""}
                      onClick={() => setConfidence(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="confidence-ends">
                  <span>Guess</span>
                  <span>Certain</span>
                </div>
              </div>
              <button
                className="primary lock-answer"
                disabled={!answer}
                onClick={commit}
              >
                <LockKeyhole size={17} />
                Lock answer<kbd>↵</kbd>
              </button>
              {hintAllowed && (
                <button
                  className="hint-button"
                  onClick={nextHint}
                  disabled={hints === challenge.hints.length}
                >
                  <Lightbulb size={16} />
                  {hints
                    ? `Next hint (${hints}/${challenge.hints.length})`
                    : "A nudge, please"}
                  <kbd>H</kbd>
                </button>
              )}
              {hints > 0 && (
                <div className="hint-panel" aria-live="polite">
                  <span className="eyebrow">HINT {hints}</span>
                  <p>{challenge.hints[hints - 1]}</p>
                </div>
              )}
            </>
          ) : (
            <div
              className="answer-feedback"
              data-testid={correct ? "correct-answer" : "incorrect-answer"}
            >
              <div
                className={`feedback-title ${correct ? "correct" : "incorrect"}`}
              >
                {correct ? <Check size={23} /> : <CircleHelp size={23} />}
                <h2>
                  {correct
                    ? "Prediction confirmed."
                    : "Let’s find the turning point."}
                </h2>
              </div>
              <div className="prediction-comparison">
                <div>
                  <span>Your prediction</span>
                  <pre>{answerLabel(challenge, answer)}</pre>
                </div>
                {!correct && (
                  <div>
                    <span>Correct answer</span>
                    <pre>{answerLabel(challenge, challenge.answer)}</pre>
                  </div>
                )}
              </div>
              {!correct && (
                <p className="distractor-feedback">
                  {distractor ||
                    `Watch ${challenge.focusLine ? `line ${challenge.focusLine}` : "the order of execution"}. ${challenge.explanation}`}
                </p>
              )}
              {confidence >= 4 && !correct && (
                <p className="review-note">
                  You were confident here. This idea will return sooner for
                  another look.
                </p>
              )}
              {challenge.traceEnabled && !faded && (
                <button
                  className="machine-button"
                  disabled={busy}
                  onClick={execute}
                >
                  <Cpu size={21} />
                  <span>
                    {busy
                      ? "Running local Python…"
                      : machine
                        ? "Python Machine is open below"
                        : "Run Python Machine"}
                    <small>Watch the real execution, one step at a time</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              )}
              <button
                className="text-button"
                onClick={() => setShowExplanation((s) => !s)}
              >
                <CircleHelp size={16} />
                {showExplanation ? "Hide explanation" : "Explain why"}
                <ChevronRight size={16} />
              </button>
              {showExplanation && (
                <div className="explanation" data-testid="explanation">
                  <span className="eyebrow">WHY IT WORKS</span>
                  <p>{challenge.explanation}</p>
                  {challenge.focusLine && (
                    <div className="turning-point">
                      <span>Follow line {challenge.focusLine}</span>
                      <code>
                        {challenge.code
                          .split("\n")
                          .at(challenge.focusLine - 1)
                          ?.trim()}
                      </code>
                    </div>
                  )}
                </div>
              )}
              <label className="scratchpad-label">
                Explain it in your own words
                <textarea
                  className="scratchpad"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="The important change was…"
                />
              </label>
              {!challenge.repair && (
                <button
                  className="primary continue-button"
                  onClick={continueSafely}
                >
                  {index === total - 1
                    ? "Finish mission"
                    : !correct && followupAvailable
                      ? "Try a related challenge"
                      : "Continue mission"}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {locked && challenge.repair && (
        <section className="repair-panel">
          <div>
            <span className="eyebrow">FIX → VERIFY</span>
            <h2>
              <Wrench size={22} />
              Choose the smallest repair.
            </h2>
            <p>
              Replace line {challenge.repair.line}, then check the result with
              real Python.
            </p>
          </div>
          <div className="choices repair-choices">
            {challenge.repair.choices.map((c) => (
              <button
                disabled={busy}
                className={`choice ${repairAnswer === c.id ? "selected" : ""}`}
                key={c.id}
                aria-pressed={repairAnswer === c.id}
                onClick={() => {
                  setRepairAnswer(c.id);
                  setRepairResult(null);
                }}
              >
                <code>{c.text}</code>
                {repairAnswer === c.id && <Check size={17} />}
              </button>
            ))}
          </div>
          <div className="actions">
            <button
              className="primary"
              disabled={!repairAnswer || busy || Boolean(repairResult)}
              onClick={verifyRepair}
            >
              <ShieldCheck size={18} />
              {busy ? "Verifying…" : "Verify repair"}
            </button>
            <button className="ghost" disabled={busy} onClick={continueSafely}>
              {repairResult?.correct
                ? "Continue mission"
                : "Continue and revisit later"}
              <ArrowRight size={17} />
            </button>
          </div>
          {repairResult && (
            <div
              className={`repair-result ${repairResult.correct ? "correct" : "incorrect"}`}
              aria-live="polite"
            >
              {repairResult.correct ? <Check size={20} /> : <X size={20} />}
              <div>
                <b>
                  {repairResult.correct
                    ? "Repair verified by Python."
                    : "That repair does not meet the goal yet."}
                </b>
                <p>
                  Expected output:{" "}
                  <code>{challenge.repair.expectedOutput}</code>
                </p>
                <p>
                  Actual:{" "}
                  <code>
                    {repairResult.trace.error
                      ? `${repairResult.trace.error.type}: ${repairResult.trace.error.message}`
                      : repairResult.trace.output || "(no output)"}
                  </code>
                </p>
              </div>
            </div>
          )}
        </section>
      )}
      {error && (
        <div className="notice error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="text-button" disabled={busy} onClick={execute}>
            Retry trace
          </button>
        </div>
      )}
      {machine && trace && (
        <PythonMachine
          trace={trace}
          code={challenge.code}
          snapshotOnly={challenge.subtopic === "list comprehensions"}
        />
      )}
    </div>
  );
}
