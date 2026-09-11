import { useState } from "react";
import { ArrowRight, Check, CircleHelp, Target } from "lucide-react";
import type { Challenge, ExamResult } from "../types";
import { topics } from "../content";
import { answerLabel } from "./ChallengeView";
import { CodeBlock } from "./CodeBlock";
export function Results({
  result,
  bank,
  target,
  onTrain,
  onHome,
}: {
  result: ExamResult;
  bank: Challenge[];
  target: number;
  onTrain: () => void;
  onHome: () => void;
}) {
  const [review, setReview] = useState<string | null>(null);
  const [missedOnly, setMissedOnly] = useState(true);
  const questions = result.challengeIds
    .map((id) => bank.find((q) => q.id === id))
    .filter((q): q is Challenge => Boolean(q));
  const missed = questions.filter((q) => result.answers[q.id] !== q.answer);
  const reviewed = bank.find((q) => q.id === review);
  return (
    <div className="results-screen">
      <div className="results-hero">
        <div className="score-orbit">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="70" />
            <circle
              className="orbit-progress"
              cx="80"
              cy="80"
              r="70"
              strokeDasharray={`${result.score * 4.398} 440`}
            />
          </svg>
          <div>
            <strong>
              {result.score}
              <span>%</span>
            </strong>
            <small>
              {result.kind === "baseline" ? "STARTING POINT" : "MOCK SCORE"}
            </small>
          </div>
        </div>
        <div>
          <span className="eyebrow">
            {result.kind === "baseline" ? "BASELINE COMPLETE" : "EXAM COMPLETE"}
          </span>
          <h1>
            {result.kind === "baseline"
              ? "Now we know where to start."
              : result.score >= target
                ? "A milestone worth keeping."
                : "You have your next mission."}
          </h1>
          <p>
            {result.kind === "baseline"
              ? "Every answer gives us a useful starting point. Your first mission will focus on the ideas that need another look."
              : `${questions.length - missed.length} of ${questions.length} correct. Review the turning points below, then put those ideas back into practice.`}
          </p>
          <div className="results-facts">
            <span>
              <Target size={16} />
              Practice target {target}%
            </span>
            <span>{Math.round(result.elapsedMs / 60000)} min elapsed</span>
          </div>
          <div className="actions">
            <button className="primary" onClick={onTrain}>
              {result.kind === "baseline"
                ? "Start my first training mission"
                : "Train my weak areas"}
              <ArrowRight size={18} />
            </button>
            <button className="ghost" onClick={onHome}>
              Mission control
            </button>
          </div>
        </div>
      </div>
      <section className="result-breakdown">
        <div className="section-heading">
          <h2>Your topic profile</h2>
          <span>Practice evidence, not a pass guarantee</span>
        </div>
        <div className="topic-results">
          {topics.map((topic) => {
            const t = result.topics[topic.id];
            if (!t) return null;
            const percent = Math.round((t.correct / t.total) * 100);
            return (
              <div className="topic-result" key={topic.id}>
                <span>{topic.name}</span>
                <div className="bar-track">
                  <span style={{ transform: `scaleX(${percent / 100})` }} />
                </div>
                <b>
                  {t.correct}/{t.total}
                </b>
                <span
                  className={`topic-status ${percent < 50 ? "needs-work" : percent >= 80 ? "strong" : "developing"}`}
                >
                  {percent < 50
                    ? "Priority"
                    : percent >= 80
                      ? "Strong start"
                      : "Developing"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="exam-review">
        <div className="section-heading">
          <h2>Review the turning points</h2>
          <div className="segmented">
            <button
              className={missedOnly ? "active" : ""}
              onClick={() => setMissedOnly(true)}
            >
              Missed ({missed.length})
            </button>
            <button
              className={!missedOnly ? "active" : ""}
              onClick={() => setMissedOnly(false)}
            >
              All ({questions.length})
            </button>
          </div>
        </div>
        {(missedOnly ? missed : questions).length === 0 ? (
          <div className="empty-review">
            <Check size={25} />
            <p>No missed questions. Keep testing with different variations.</p>
          </div>
        ) : (
          <div className="review-list">
            {(missedOnly ? missed : questions).map((q) => (
              <button
                key={q.id}
                className={review === q.id ? "active" : ""}
                onClick={() => setReview(review === q.id ? null : q.id)}
              >
                {result.answers[q.id] === q.answer ? (
                  <Check size={18} />
                ) : (
                  <CircleHelp size={18} />
                )}
                <span>
                  <b>{q.title}</b>
                  <small>
                    {q.topic} · {q.subtopic}
                  </small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        )}
        {reviewed && (
          <div className="review-detail">
            <CodeBlock code={reviewed.code} focusLine={reviewed.focusLine} />
            <div>
              <h3>{reviewed.question}</h3>
              <div className="prediction-comparison">
                <div>
                  <span>Your answer</span>
                  <pre>
                    {answerLabel(reviewed, result.answers[reviewed.id] || "")}
                  </pre>
                </div>
                <div>
                  <span>Correct answer</span>
                  <pre>{answerLabel(reviewed, reviewed.answer)}</pre>
                </div>
              </div>
              <p>{reviewed.explanation}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
