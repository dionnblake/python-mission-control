import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Flag,
  LockKeyhole,
} from "lucide-react";
import type { ActiveAssessment, Challenge } from "../types";
import { CodeBlock } from "./CodeBlock";
export function Assessment({
  assessment,
  questions,
  onAnswer,
  onNavigate,
  onSubmit,
}: {
  assessment: ActiveAssessment;
  questions: Challenge[];
  onAnswer: (answer: string, confidence: number, elapsedMs: number) => void;
  onNavigate: (index: number) => void;
  onSubmit: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const remaining = assessment.deadline
    ? Math.max(0, assessment.deadline - now)
    : null;
  const answered = Object.keys(assessment.answers).filter(
    (k) => assessment.answers[k],
  ).length;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (remaining === 0) onSubmit();
  }, [remaining, onSubmit]);
  return (
    <div className="assessment-screen">
      <div className="challenge-top">
        <div>
          <span className="eyebrow">
            {assessment.mode === "baseline" ? "STARTING PROFILE" : "MOCK EXAM"}{" "}
            · {questions.length} QUESTIONS
          </span>
          <h1>
            {assessment.mode === "baseline"
              ? "Find your starting point."
              : "Trust your reasoning."}
          </h1>
        </div>
        {remaining !== null ? (
          <div
            className={`exam-timer ${remaining < 60000 ? "urgent" : ""}`}
            role="timer"
          >
            <Clock3 size={19} />
            {Math.floor(remaining / 60000)
              .toString()
              .padStart(2, "0")}
            :{Math.floor(remaining / 1000) % 60 < 10 ? "0" : ""}
            {Math.floor(remaining / 1000) % 60}
            <small>remaining</small>
          </div>
        ) : (
          <span className="mode-label">
            Take your time. This is a starting point.
          </span>
        )}
      </div>
      <div className="assessment-strip">
        <span>
          <LockKeyhole size={15} />
          Answers stay hidden until you submit.
        </span>
        <b>
          {answered} of {questions.length} answered
        </b>
      </div>
      <AssessmentQuestion
        key={assessment.ids[assessment.index]}
        challenge={questions[assessment.index]}
        savedAnswer={assessment.answers[assessment.ids[assessment.index]] || ""}
        savedConfidence={
          assessment.confidences[assessment.ids[assessment.index]] || 3
        }
        savedTime={assessment.times[assessment.ids[assessment.index]] || 0}
        onAnswer={onAnswer}
        onNext={() =>
          assessment.index < questions.length - 1
            ? onNavigate(assessment.index + 1)
            : setConfirmSubmit(true)
        }
        number={assessment.index + 1}
        last={assessment.index === questions.length - 1}
      />
      <div className="exam-navigation">
        <button
          className="ghost"
          disabled={assessment.index === 0}
          onClick={() => onNavigate(assessment.index - 1)}
        >
          <ArrowLeft size={16} />
          Previous
        </button>
        <nav aria-label="Exam question navigation">
          {questions.map((q, i) => (
            <button
              key={q.id}
              aria-label={`Question ${i + 1}${assessment.answers[q.id] ? ", answered" : ""}`}
              aria-current={i === assessment.index ? "step" : undefined}
              className={`${i === assessment.index ? "active" : ""} ${assessment.answers[q.id] ? "answered" : ""}`}
              onClick={() => onNavigate(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
        <button className="secondary" onClick={() => setConfirmSubmit(true)}>
          <Flag size={15} />
          Submit {assessment.mode === "baseline" ? "baseline" : "exam"}
        </button>
      </div>
      {confirmSubmit && (
        <div
          className="submit-review"
          role="region"
          aria-label="Confirm assessment submission"
        >
          <div>
            <h2>Ready to see your results?</h2>
            <p>
              {answered === questions.length
                ? "Every question has an answer."
                : `${questions.length - answered} unanswered questions will count as incorrect.`}{" "}
              You can review everything after submission.
            </p>
          </div>
          <div className="actions">
            <button className="ghost" onClick={() => setConfirmSubmit(false)}>
              Keep answering
            </button>
            <button className="primary" onClick={onSubmit}>
              Submit and see results
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function AssessmentQuestion({
  challenge,
  savedAnswer,
  savedConfidence,
  savedTime,
  onAnswer,
  onNext,
  number,
  last,
}: {
  challenge: Challenge;
  savedAnswer: string;
  savedConfidence: number;
  savedTime: number;
  onAnswer: (answer: string, confidence: number, elapsedMs: number) => void;
  onNext: () => void;
  number: number;
  last: boolean;
}) {
  const [confidence, setConfidence] = useState(savedConfidence);
  const [order, setOrder] = useState(
    savedAnswer ? savedAnswer.split("|") : challenge.choices.map((c) => c.id),
  );
  const started = useRef(Date.now());
  const initialTime = useRef(savedTime);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  function choose(answer: string, c = confidence) {
    onAnswer(answer, c, initialTime.current + Date.now() - started.current);
  }
  function next() {
    if (challenge.type === "order-lines") choose(order.join("|"));
    else if (savedAnswer) choose(savedAnswer);
    onNext();
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest(
            'input,textarea,select,button,[contenteditable="true"]',
          ))
      )
        return;
      if (/^[1-4]$/.test(e.key) && challenge.type !== "order-lines")
        choose(challenge.choices[Number(e.key) - 1]?.id || "");
      if (e.key === "Enter") {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div className="challenge-workspace assessment-workspace">
      <div className="challenge-code">
        <div className="topic-bar">
          <span>QUESTION {String(number).padStart(2, "0")}</span>
          <span>{challenge.topic.toUpperCase()}</span>
        </div>
        <CodeBlock code={challenge.displayCode || challenge.code} />
      </div>
      <div className="answer-panel">
        <span className="eyebrow">YOUR ANSWER</span>
        <h2 ref={heading} tabIndex={-1}>
          {challenge.question}
        </h2>
        {challenge.type === "order-lines" ? (
          <>
            <div className="order-choices">
              {order.map((id, i) => (
                <div className="order-line" key={id}>
                  <span>{i + 1}</span>
                  <code>
                    {challenge.choices.find((c) => c.id === id)?.text}
                  </code>
                  <div>
                    <button
                      aria-label={`Move line ${i + 1} up`}
                      className="icon-button"
                      disabled={i === 0}
                      onClick={() => {
                        const a = [...order];
                        [a[i], a[i - 1]] = [a[i - 1], a[i]];
                        setOrder(a);
                        choose(a.join("|"));
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label={`Move line ${i + 1} down`}
                      className="icon-button"
                      disabled={i === order.length - 1}
                      onClick={() => {
                        const a = [...order];
                        [a[i], a[i + 1]] = [a[i + 1], a[i]];
                        setOrder(a);
                        choose(a.join("|"));
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="text-button"
              onClick={() => choose(order.join("|"))}
            >
              <Check size={16} />
              Save this order
            </button>
          </>
        ) : (
          <div className="choices" role="group" aria-label="Answer choices">
            {challenge.choices.map((c, i) => (
              <button
                key={c.id}
                className={`choice ${savedAnswer === c.id ? "selected" : ""}`}
                aria-pressed={savedAnswer === c.id}
                onClick={() => choose(c.id)}
              >
                <span className="choice-key">
                  {String.fromCharCode(65 + i)}
                </span>
                <code>{c.text}</code>
                {savedAnswer === c.id && <Check size={18} />}
              </button>
            ))}
          </div>
        )}
        <div className="confidence">
          <span>
            Confidence <small>optional</small>
          </span>
          <div role="group" aria-label="Confidence">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-label={`Confidence ${n} of 5`}
                aria-pressed={n === confidence}
                className={n === confidence ? "active" : ""}
                onClick={() => {
                  setConfidence(n);
                  if (savedAnswer) choose(savedAnswer, n);
                }}
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
        <button className="primary lock-answer" onClick={next}>
          {last ? "Review and submit" : "Next question"}
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
