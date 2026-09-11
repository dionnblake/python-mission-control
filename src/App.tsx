import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Clock3,
  Cpu,
  Flame,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Target,
  Trophy,
  Wrench,
  Zap,
} from "lucide-react";
import { challenges, topics, baselineIds, bossIds } from "./content";
import {
  conceptStatus,
  createExam,
  createProgress,
  phaseFor,
  recordAttempt,
  scaffoldFor,
  scoreExam,
  selectMission,
  similarChallenge,
  topicSummary,
  validateProgress,
} from "./core/learning";
import { loadProgress, saveProgress } from "./bridge";
import { APP_NAME, APP_VERSION, EXAM_MINUTES, EXAM_QUESTIONS } from "./config";
import type {
  ActiveAssessment,
  Challenge,
  ExamResult,
  Progress,
  Scaffold,
  Topic,
} from "./types";
import { ChallengeView } from "./components/ChallengeView";
import { Assessment } from "./components/Assessment";
import { Results } from "./components/Results";
import { CodeBlock } from "./components/CodeBlock";

type Route =
  | "home"
  | "train"
  | "progress"
  | "exams"
  | "settings"
  | "assessment"
  | "results"
  | "session"
  | "summary";
interface Mission {
  id: string;
  questions: Challenge[];
  scaffolds: Record<string, Scaffold>;
  hintDrafts: Record<string, number>;
  index: number;
  correct: number;
  hints: number;
  mode: "training" | "boss";
  startedAt: number;
  followups: string[];
}
const topicIcon: Record<Topic, string> = {
  variables: "x =",
  strings: '" "',
  conditionals: "if",
  collections: "[ ]",
  loops: "↻",
  functions: "ƒ",
  exceptions: "! ",
  other: "{ }",
};
const today = () => new Date().toLocaleDateString("en-CA");
function phaseNumber(progress: Progress) {
  return { foundation: 1, fluency: 2, "exam-preparation": 3 }[
    phaseFor(progress)
  ];
}
function statusClass(text: string) {
  return text.toLowerCase().replaceAll(" ", "-");
}
function bestExam(progress: Progress) {
  const scores = progress.exams
    .filter((e) => e.kind === "exam")
    .map((e) => e.score);
  return scores.length ? Math.max(...scores) : null;
}
const minutes = (n: number) => Math.max(1, Math.round(n / 60000));

export default function App() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const latest = useRef<Progress | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const saves = useRef(Promise.resolve());
  const revision = useRef(0);
  const [route, setRoute] = useState<Route>("home");
  const [mission, setMission] = useState<Mission | null>(null);
  const missionRef = useRef<Mission | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [finish, setFinish] = useState<{
    correct: number;
    total: number;
    elapsedMs: number;
    hints: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const raw = await loadProgress();
      const p = raw === null ? createProgress() : validateProgress(raw);
      if (
        p.activeAssessment &&
        p.activeAssessment.ids.some(
          (id) => !challenges.some((c) => c.id === id),
        )
      )
        throw new Error(
          "This saved assessment uses content that is not available. Restore the matching app version before continuing.",
        );
      latest.current = p;
      setProgress(p);
      if (p.activeAssessment) setRoute("assessment");
    } catch (e) {
      setLoadError(String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * (progress?.settings.textScale || 1)}px`;
  }, [progress?.settings.textScale]);
  useEffect(() => {
    const handle = (e: BeforeUnloadEvent) => {
      if (saving || saveError) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [saving, saveError]);
  function persist(p: Progress) {
    latest.current = p;
    setProgress(p);
    setSaving(true);
    const n = ++revision.current;
    saves.current = saves.current
      .catch(() => undefined)
      .then(() => saveProgress(p))
      .then(() => {
        if (revision.current === n) {
          setSaving(false);
          setSaveError("");
        }
      })
      .catch((e) => {
        if (revision.current === n) {
          setSaving(false);
          setSaveError(String(e));
        }
      });
  }
  function update(fn: (p: Progress) => Progress) {
    if (latest.current) persist(fn(latest.current));
  }
  function beginAssessment(mode: "baseline" | "exam") {
    if (!latest.current) return;
    if (latest.current.activeAssessment) {
      setRoute("assessment");
      return;
    }
    const now = Date.now();
    const questions =
      mode === "baseline"
        ? baselineIds.map((id) => challenges.find((c) => c.id === id)!)
        : createExam(
            challenges,
            latest.current.settings.weights,
            EXAM_QUESTIONS,
            now,
          );
    const active: ActiveAssessment = {
      id: crypto.randomUUID(),
      mode,
      ids: questions.map((q) => q.id),
      answers: {},
      confidences: {},
      times: {},
      startedAt: now,
      deadline: mode === "exam" ? now + EXAM_MINUTES * 60000 : null,
      index: 0,
    };
    update((p) => ({
      ...p,
      onboardingComplete: true,
      activeAssessment: active,
    }));
    setRoute("assessment");
  }
  function answerAssessment(
    answer: string,
    confidence: number,
    elapsedMs: number,
  ) {
    if (
      latest.current?.activeAssessment?.deadline &&
      Date.now() >= latest.current.activeAssessment.deadline
    ) {
      submitAssessment();
      return;
    }
    update((p) => {
      const a = p.activeAssessment;
      if (!a) return p;
      const id = a.ids[a.index];
      return {
        ...p,
        activeAssessment: {
          ...a,
          answers: { ...a.answers, [id]: answer },
          confidences: { ...a.confidences, [id]: confidence },
          times: { ...a.times, [id]: Math.min(elapsedMs, 7 * 86400000) },
        },
      };
    });
  }
  function submitAssessment() {
    const p = latest.current;
    const active = p?.activeAssessment;
    if (!p || !active) return;
    const questions = active.ids.map((id) =>
      challenges.find((c) => c.id === id)!,
    );
    const at = Date.now();
    const scored = scoreExam(questions, active.answers);
    const exam: ExamResult = {
      id: active.id,
      kind: active.mode,
      at,
      elapsedMs: Math.min(
        7 * 86400000,
        Math.max(0, Math.min(at, active.deadline ?? at) - active.startedAt),
      ),
      challengeIds: active.ids,
      answers: active.answers,
      ...scored,
    };
    let next = p;
    for (const q of questions)
      next = recordAttempt(next, {
        id: `${active.id}:${q.id}`,
        challengeId: q.id,
        family: q.family,
        topic: q.topic,
        answer: active.answers[q.id] || "",
        correct: active.answers[q.id] === q.answer,
        hints: 0,
        confidence: active.confidences[q.id] || 3,
        elapsedMs: active.times[q.id] || 0,
        at,
        mode: active.mode,
      });
    next = {
      ...next,
      baselineComplete: next.baselineComplete || active.mode === "baseline",
      exams: [...next.exams, exam],
    };
    delete next.activeAssessment;
    persist(next);
    setResult(exam);
    setRoute("results");
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      const a = latest.current?.activeAssessment;
      if (a?.deadline && Date.now() >= a.deadline) submitAssessment();
    }, 500);
    return () => window.clearInterval(timer);
  });
  function beginMission(topic?: Topic, boss = false) {
    const p = latest.current;
    if (!p) return;
    if (p.activeAssessment) {
      setRoute("assessment");
      return;
    }
    const bank = topic
      ? challenges.filter((q) => q.topic === topic)
      : challenges;
    const questions = boss
      ? bossIds.map((id) => challenges.find((q) => q.id === id)!)
      : selectMission(bank, p, p.settings.sessionLength, Date.now());
    const m: Mission = {
      id: crypto.randomUUID(),
      questions,
      scaffolds: Object.fromEntries(
        questions.map((q) => [q.id, scaffoldFor(p, q)]),
      ),
      hintDrafts: {},
      index: 0,
      correct: 0,
      hints: 0,
      mode: boss ? "boss" : "training",
      startedAt: Date.now(),
      followups: [],
    };
    missionRef.current = m;
    setMission(m);
    setRoute("session");
  }
  function lockAnswer(
    answer: string,
    hints: number,
    confidence: number,
    elapsedMs: number,
  ) {
    const m = missionRef.current;
    if (!m) return;
    const q = m.questions[m.index];
    if (latest.current?.attempts.some((a) => a.id === `${m.id}:${m.index}`))
      return;
    const correct = answer === q.answer;
    update((p) =>
      recordAttempt(p, {
        id: `${m.id}:${m.index}`,
        challengeId: q.id,
        family: q.family,
        topic: q.topic,
        answer,
        correct,
        hints,
        confidence,
        elapsedMs,
        at: Date.now(),
        mode: m.mode,
      }),
    );
    const next = {
      ...m,
      correct: m.correct + Number(correct),
      hints: m.hints + hints,
    };
    if (
      (!correct || confidence <= 2) &&
      !m.followups.includes(q.family) &&
      m.index < m.questions.length - 1
    ) {
      const related = similarChallenge(
        challenges,
        q,
        m.questions.map((c) => c.id),
      );
      if (related) {
        next.questions = [...m.questions];
        next.questions[m.index + 1] = related;
        next.scaffolds = {
          ...m.scaffolds,
          [related.id]: scaffoldFor(latest.current!, related),
        };
        next.followups = [...m.followups, q.family];
      }
    }
    missionRef.current = next;
    setMission(next);
  }
  function recordRepair(
    m: Mission,
    questionIndex: number,
    answer: string,
    correct: boolean,
    elapsedMs: number,
  ) {
    const q = m.questions[questionIndex];
    const n = latest.current!.attempts.filter((a) =>
      a.id.startsWith(`${m.id}:${questionIndex}:repair:`),
    ).length;
    update((p) =>
      recordAttempt(p, {
        id: `${m.id}:${questionIndex}:repair:${n}`,
        challengeId: q.id,
        family: q.family,
        topic: q.topic,
        answer: `repair:${answer}`,
        correct,
        hints: 1,
        confidence: 3,
        elapsedMs: Math.min(elapsedMs, 7 * 86400000),
        at: Date.now(),
        mode: m.mode,
      }),
    );
  }
  function rememberHints(count: number) {
    const m = missionRef.current;
    if (!m) return;
    const next = {
      ...m,
      hintDrafts: { ...m.hintDrafts, [m.questions[m.index].id]: count },
    };
    missionRef.current = next;
    setMission(next);
  }
  function continueMission() {
    const m = missionRef.current;
    if (!m) return;
    if (m.index === m.questions.length - 1) {
      setFinish({
        correct: m.correct,
        total: m.questions.length,
        elapsedMs: Date.now() - m.startedAt,
        hints: m.hints,
      });
      update((p) => ({ ...p, sessions: p.sessions + 1 }));
      missionRef.current = null;
      setMission(null);
      setRoute("summary");
    } else {
      const next = { ...m, index: m.index + 1 };
      missionRef.current = next;
      setMission(next);
    }
  }
  function navigate(next: Route) {
    setRoute(latest.current?.activeAssessment ? "assessment" : next);
  }
  if (!progress)
    return (
      <main className="startup-error">
        <div className="brand-mark">
          <Cpu />
        </div>
        <h1>{APP_NAME}</h1>
        {loadError ? (
          <>
            <div className="notice error" role="alert">
              {loadError}
            </div>
            <p>Existing progress has not been replaced.</p>
            <button className="primary" onClick={() => void load()}>
              <RotateCcw size={18} />
              Retry connection
            </button>
          </>
        ) : (
          <p>Opening your local mission log…</p>
        )}
      </main>
    );
  const level = Math.floor(progress.xp / 200) + 1;
  const day = Math.max(
    1,
    Math.floor((Date.now() - progress.startedAt) / 86400000) + 1,
  );
  const inActivity = route === "session" || route === "assessment";
  const active = progress.activeAssessment;
  const navigation = [
    { id: "home" as Route, label: "Mission control", icon: LayoutDashboard },
    { id: "train" as Route, label: "Training deck", icon: BookOpen },
    { id: "progress" as Route, label: "Your progress", icon: Activity },
    { id: "exams" as Route, label: "Mock exams", icon: GraduationCap },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Cpu size={24} />
          </div>
          <div>
            PYTHON<span>MISSION CONTROL</span>
          </div>
        </div>
        <div className="sidebar-section">YOUR FLIGHT DECK</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              disabled={Boolean(active)}
              title={
                active
                  ? "Finish or submit the assessment to return to training."
                  : undefined
              }
              className={
                route === id ||
                (id === "train" && route === "session") ||
                (id === "exams" && route === "assessment")
                  ? "active"
                  : ""
              }
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {route === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        {mission && route !== "session" && !active && (
          <button
            className="resume-sidebar"
            onClick={() => setRoute("session")}
          >
            <Play size={16} />
            Resume mission
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="level-card">
            <div>
              <span className="level-icon">
                <Zap size={19} />
              </span>
              <div>
                <b>LEVEL {String(level).padStart(2, "0")}</b>
                <span>{progress.xp} XP earned</span>
              </div>
            </div>
            <div className="bar-track">
              <span
                style={{ transform: `scaleX(${(progress.xp % 200) / 200})` }}
              />
            </div>
            <small>{200 - (progress.xp % 200)} XP to the next level</small>
          </div>
          <button
            className={
              route === "settings" ? "active settings-link" : "settings-link"
            }
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            Preferences
          </button>
          <div className="local-status">
            <span className="status-dot" />
            <span>
              {saving
                ? "Saving progress…"
                : saveError
                  ? "Save needs attention"
                  : "Saved on this device"}
            </span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div>
            <span className="mono">90-DAY PYTHON PROGRAM</span>
            <span className="topbar-divider" />
            <span>One goal. Read Python with confidence.</span>
          </div>
          <span className="day-badge">
            DAY <b>{String(day).padStart(2, "0")}</b>
            <span>/ 90</span>
          </span>
        </header>
        {saveError && (
          <div className="notice error save-error" role="alert">
            <span>
              Progress could not be saved: {saveError}. Keep the app open and
              retry.
            </span>
            <button
              className="secondary"
              onClick={() => latest.current && persist(latest.current)}
            >
              Retry save
            </button>
          </div>
        )}
        {active && route !== "assessment" && (
          <div className="resume-banner">
            <span>
              <Clock3 size={16} />
              Your {active.mode === "exam" ? "timed exam" : "baseline"} is still
              in progress.
              {active.deadline ? " The timer is still running." : ""}
            </span>
            <button
              className="text-button"
              onClick={() => setRoute("assessment")}
            >
              Resume
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        <main
          className={`main-content ${inActivity ? "activity-content" : ""}`}
          id="main-content"
        >
          {!progress.onboardingComplete && route === "home" ? (
            <Onboarding onStart={() => beginAssessment("baseline")} />
          ) : route === "home" ? (
            <Home
              progress={progress}
              onTrain={() => beginMission()}
              onBaseline={() => beginAssessment("baseline")}
              onProgress={() => navigate("progress")}
              onExams={() => navigate("exams")}
            />
          ) : route === "train" ? (
            <TrainingDeck progress={progress} onTrain={beginMission} />
          ) : route === "progress" ? (
            <ProgressScreen progress={progress} onTrain={beginMission} />
          ) : route === "settings" ? (
            <Preferences
              progress={progress}
              onSave={(settings) => update((p) => ({ ...p, settings }))}
            />
          ) : route === "exams" ? (
            <Exams
              progress={progress}
              onStart={() => beginAssessment("exam")}
              onResult={(r) => {
                setResult(r);
                setRoute("results");
              }}
            />
          ) : route === "assessment" && active ? (
            <Assessment
              assessment={active}
              questions={active.ids.map((id) =>
                challenges.find((q) => q.id === id)!,
              )}
              onAnswer={answerAssessment}
              onNavigate={(index) =>
                update((p) =>
                  p.activeAssessment
                    ? {
                        ...p,
                        activeAssessment: { ...p.activeAssessment, index },
                      }
                    : p,
                )
              }
              onSubmit={submitAssessment}
            />
          ) : route === "session" && mission ? (
            <ChallengeView
              key={`${mission.id}:${mission.index}`}
              challenge={mission.questions[mission.index]}
              index={mission.index}
              total={mission.questions.length}
              scaffold={mission.scaffolds[mission.questions[mission.index].id]}
              boss={mission.mode === "boss"}
              onLock={lockAnswer}
              onContinue={continueMission}
              onRepair={(answer, correct, elapsedMs) =>
                recordRepair(mission, mission.index, answer, correct, elapsedMs)
              }
              initialHintCount={
                mission.hintDrafts[mission.questions[mission.index].id] || 0
              }
              onHintCount={rememberHints}
              initialAttempt={progress.attempts.find(
                (a) => a.id === `${mission.id}:${mission.index}`,
              )}
              hadRepair={progress.attempts.some((a) =>
                a.id.startsWith(`${mission.id}:${mission.index}:repair:`),
              )}
              followupAvailable={Boolean(
                similarChallenge(
                  challenges,
                  mission.questions[mission.index],
                  [],
                ),
              )}
              isFollowup={
                mission.index > 0 &&
                mission.questions[mission.index].family ===
                  mission.questions[mission.index - 1].family
              }
            />
          ) : route === "results" && result ? (
            <Results
              result={result}
              bank={challenges}
              target={progress.settings.targetScore}
              onTrain={() => beginMission()}
              onHome={() => navigate("home")}
            />
          ) : route === "summary" && finish ? (
            <SessionSummary
              data={finish}
              progress={progress}
              onNext={() => beginMission()}
              onHome={() => navigate("home")}
            />
          ) : (
            <Home
              progress={progress}
              onTrain={() => beginMission()}
              onBaseline={() => beginAssessment("baseline")}
              onProgress={() => navigate("progress")}
              onExams={() => navigate("exams")}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} />
            Local learning. Real Python. Your pace.
          </span>
          <span>
            {APP_NAME} <span className="mono">v{APP_VERSION}</span>
          </span>
        </footer>
      </div>
    </div>
  );
}

function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <div className="onboarding">
      <div className="onboarding-heading">
        <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
        <h1>
          90 days.
          <br />
          One goal.
          <br />
          <span>
            Learn enough Python
            <br />
            to pass.
          </span>
        </h1>
        <p>
          You don’t need to memorize a textbook.
          <br />
          You need to understand what the code does next.
        </p>
        <button className="primary start-cta" onClick={onStart}>
          Start baseline mission
          <ArrowRight size={20} />
        </button>
        <div className="time-note">
          <Clock3 size={14} />
          {baselineIds.length} short questions · no pressure · no setup
        </div>
      </div>
      <div className="onboarding-right">
        <div className="intro-code">
          <div className="mini-label">
            <Cpu size={17} />
            THIS IS HOW WE LEARN
          </div>
          <CodeBlock
            code={
              "fuel = 4\nboost = fuel + 3\n\nif boost > 5:\n    fuel = boost * 2\n\nprint(fuel)"
            }
          />
          <p>
            Don’t run it yet.
            <br />
            <strong>What do you think it prints?</strong>
          </p>
        </div>
        <ol className="learning-principles">
          <li>
            <span>01</span>
            <div>
              <b>Predict before you run.</b>
              <p>Read the code. Commit to what happens next.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <b>Make the mistake useful.</b>
              <p>Trace the turning point. Missed ideas return.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <b>Build your own mental machine.</b>
              <p>Assistance fades. Mock exams measure progress.</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
function Home({
  progress,
  onTrain,
  onBaseline,
  onProgress,
  onExams,
}: {
  progress: Progress;
  onTrain: () => void;
  onBaseline: () => void;
  onProgress: () => void;
  onExams: () => void;
}) {
  const best = bestExam(progress);
  const phase = phaseNumber(progress);
  const recent = progress.attempts.filter(
    (a) => new Date(a.at).toLocaleDateString("en-CA") === today(),
  );
  const weak = topics
    .map((t) => ({ topic: t, summary: topicSummary(progress, t.id) }))
    .sort(
      (a, b) =>
        (a.summary ? a.summary.correct / a.summary.attempts : 0) -
        (b.summary ? b.summary.correct / b.summary.attempts : 0),
    )
    .slice(0, 3);
  return (
    <div className="home-screen">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PICK UP WHERE YOU ARE</span>
          <h1>
            Small sessions.
            <br />
            <span>Stronger instincts.</span>
          </h1>
        </div>
        <div className="daily-target">
          <div>
            <Flame size={19} />
            <b>{recent.length}</b>
            <span>/ {progress.settings.sessionLength}</span>
          </div>
          <span>today’s practice target</span>
        </div>
      </div>
      <section className="today-mission">
        <div className="mission-brief">
          <span className="eyebrow">
            <span className="status-dot" /> YOUR NEXT MISSION
          </span>
          <h2>
            {!progress.baselineComplete
              ? "Find your starting point."
              : phase === 1
                ? "Learn to think like Python."
                : phase === 2
                  ? "Connect what you know."
                  : "Sharpen your test instincts."}
          </h2>
          <p>
            {!progress.baselineComplete
              ? "A short baseline helps us find your starting point. No feedback until you finish."
              : phase === 1
                ? "Read the code. Predict the result. Follow each change inside the Python Machine."
                : phase === 2
                  ? "Combine loops, collections, and functions. Watch for the small changes that alter the result."
                  : "Mixed topics, fewer hints, and another chance to repair your weak areas."}
          </p>
          <div className="mission-meta">
            <span>
              <Clock3 size={16} />
              {progress.settings.sessionLength === 6
                ? "5–8"
                : progress.settings.sessionLength === 12
                  ? "12–18"
                  : "25–30"}{" "}
              minutes
            </span>
            <span>
              <Target size={16} />
              {progress.settings.sessionLength} challenges
            </span>
            <span>
              <Zap size={16} />
              Daily practice
            </span>
          </div>
          <button
            className="primary start-cta"
            onClick={progress.baselineComplete ? onTrain : onBaseline}
          >
            {progress.baselineComplete
              ? "Start today’s mission"
              : "Start baseline mission"}
            <ArrowRight size={20} />
          </button>
        </div>
        <div className="mission-visual" aria-hidden="true">
          <div className="orbital-grid" />
          <div className="mission-orbit">
            <svg viewBox="0 0 240 240">
              <circle cx="120" cy="120" r="105" />
              <circle
                className="orbital-accent"
                cx="120"
                cy="120"
                r="105"
                strokeDasharray={`${Math.min(recent.length / progress.settings.sessionLength, 1) * 660} 660`}
              />
              <circle className="orbital-inner" cx="120" cy="120" r="84" />
            </svg>
            <div>
              <span>PHASE {String(phase).padStart(2, "0")}</span>
              <Cpu size={52} />
              <b>
                {phase === 1
                  ? "LEARN THE MACHINE"
                  : phase === 2
                    ? "BUILD FLUENCY"
                    : "PASS THE TEST"}
              </b>
            </div>
          </div>
          <span className="coordinate">PREDICT → TRACE → UNDERSTAND</span>
        </div>
      </section>
      <div className="home-secondary">
        <section className="focus-section">
          <div className="section-heading">
            <h2>Your next focus</h2>
            <button className="text-button" onClick={onProgress}>
              All concepts
              <ArrowRight size={15} />
            </button>
          </div>
          {weak.map(({ topic, summary }) => (
            <div className="focus-row" key={topic.id}>
              <span className="topic-symbol">{topicIcon[topic.id]}</span>
              <div>
                <h3>{topic.name}</h3>
                <span>{topic.description}</span>
              </div>
              <span
                className={`topic-status ${statusClass(conceptStatus(summary))}`}
              >
                {conceptStatus(summary)}
              </span>
            </div>
          ))}
        </section>
        <section className="readiness-section">
          <div className="section-heading">
            <h2>Practice readiness</h2>
            <Target size={19} />
          </div>
          <div className="readiness-score">
            <strong>
              {best ?? "—"}
              {best !== null && <span>%</span>}
            </strong>
            <div>
              Best mock exam
              <br />
              <b>Target {progress.settings.targetScore}%</b>
            </div>
          </div>
          <div className="bar-track readiness-bar">
            <span style={{ transform: `scaleX(${(best || 0) / 100})` }} />
            <i style={{ left: `${progress.settings.targetScore}%` }} />
          </div>
          <p>
            {best === null
              ? "Your first mock exam sets the marker. There’s no score to chase until you begin."
              : "Your scores are practice evidence. Keep training the concepts behind the numbers."}
          </p>
          <button className="secondary" onClick={onExams}>
            Enter the exam room
            <ArrowRight size={17} />
          </button>
        </section>
      </div>
      <Roadmap phase={phase} />
    </div>
  );
}
function Roadmap({ phase }: { phase: number }) {
  return (
    <section className="roadmap">
      <div className="section-heading">
        <h2>Your 90-day flight plan</h2>
        <span>Flexible pace. A clear direction.</span>
      </div>
      <div className="roadmap-phases">
        {[
          {
            n: 1,
            time: "WEEKS 1–4",
            title: "Learn the machine",
            text: "Values, decisions, loops, and functions.",
          },
          {
            n: 2,
            time: "WEEKS 5–8",
            title: "Build fluency",
            text: "Combine concepts. Find and repair bugs.",
          },
          {
            n: 3,
            time: "WEEKS 9–12",
            title: "Pass the test",
            text: "Mixed practice. Less assistance. Mock exams.",
          },
        ].map((p) => (
          <div key={p.n} className={phase === p.n ? "current" : ""}>
            <span className="phase-number">
              {phase > p.n ? <Check size={17} /> : String(p.n).padStart(2, "0")}
            </span>
            <div>
              <span>
                {p.time}
                {phase === p.n ? " · CURRENT" : ""}
              </span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
function TrainingDeck({
  progress,
  onTrain,
}: {
  progress: Progress;
  onTrain: (topic?: Topic, boss?: boolean) => void;
}) {
  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TRAIN YOUR REASONING</span>
          <h1>The training deck.</h1>
          <p>One idea at a time. Then bring them together.</p>
        </div>
        <button className="primary" onClick={() => onTrain()}>
          Start a mixed mission
          <ArrowRight size={18} />
        </button>
      </div>
      <div className="training-topics">
        {topics.map((t) => (
          <button
            className="topic-mission"
            key={t.id}
            onClick={() => onTrain(t.id)}
          >
            <span className="topic-symbol large">{topicIcon[t.id]}</span>
            <div>
              <div className="topic-mission-top">
                <h2>{t.name}</h2>
                <span
                  className={`topic-status ${statusClass(conceptStatus(topicSummary(progress, t.id)))}`}
                >
                  {conceptStatus(topicSummary(progress, t.id))}
                </span>
              </div>
              <p>{t.description}</p>
              <small>
                {challenges.filter((q) => q.topic === t.id).length} variations ·{" "}
                {
                  new Set(
                    challenges
                      .filter((q) => q.topic === t.id)
                      .map((q) => q.family),
                  ).size
                }{" "}
                concepts
              </small>
            </div>
            <ArrowRight size={20} />
          </button>
        ))}
      </div>
      <section className="boss-mission">
        <div className="boss-icon">
          <Wrench size={36} />
        </div>
        <div>
          <span className="eyebrow">BOSS MISSION</span>
          <h2>A debugging incident.</h2>
          <p>
            {bossIds.length} cases. Read the symptoms, find the wrong line, and
            prove the repair.
          </p>
        </div>
        <button className="secondary" onClick={() => onTrain(undefined, true)}>
          Investigate
          <ArrowRight size={17} />
        </button>
      </section>
      <p className="footnote">
        Missions choose from {challenges.length} deterministic variations.
        Familiar ideas return with different values.
      </p>
    </div>
  );
}
function ProgressScreen({
  progress,
  onTrain,
}: {
  progress: Progress;
  onTrain: (topic?: Topic) => void;
}) {
  const phase = phaseNumber(progress);
  const attempts = progress.attempts;
  const recent = attempts.slice(-20);
  const correct = recent.filter((a) => a.correct).length;
  const confidentWrong = attempts.filter(
    (a) => !a.correct && a.confidence >= 4,
  ).length;
  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVIDENCE OVER GUESSWORK</span>
          <h1>Your progress.</h1>
          <p>See what’s sticking and where another pass will help.</p>
        </div>
        <div className="progress-emblem">
          <Trophy size={32} />
          <span>LEVEL {Math.floor(progress.xp / 200) + 1}</span>
        </div>
      </div>
      <div className="progress-stats">
        <div>
          <span>Completed missions</span>
          <b>{progress.sessions}</b>
        </div>
        <div>
          <span>Recent accuracy</span>
          <b>
            {recent.length
              ? `${Math.round((correct / recent.length) * 100)}%`
              : "—"}
          </b>
          <small>last {recent.length} answers</small>
        </div>
        <div>
          <span>Study days</span>
          <b>{progress.studyDays.length}</b>
        </div>
        <div>
          <span>High-confidence misses</span>
          <b>{confidentWrong}</b>
          <small>receive earlier review</small>
        </div>
      </div>
      <section>
        <div className="section-heading">
          <h2>Your concept map</h2>
          <span>Start with “Needs work”</span>
        </div>
        <div className="concept-table">
          <div className="concept-table-header">
            <span>TOPIC</span>
            <span>STATUS</span>
            <span>ATTEMPTS</span>
            <span>NO-HINT ACCURACY</span>
            <span>AVG. TIME</span>
            <span />
          </div>
          {topics.map((t) => {
            const s = topicSummary(progress, t.id);
            const families = [
              ...new Set(
                challenges.filter((q) => q.topic === t.id).map((q) => q.family),
              ),
            ];
            const practiced = families.filter(
              (family) => progress.concepts[family]?.attempts,
            ).length;
            return (
              <div className="concept-row" key={t.id}>
                <span>
                  <span className="topic-symbol">{topicIcon[t.id]}</span>
                  <span>
                    <b>{t.name}</b>
                    <small className="concept-coverage">
                      {practiced} / {families.length} concepts practiced
                    </small>
                  </span>
                </span>
                <span
                  className={`topic-status ${statusClass(conceptStatus(s))}`}
                >
                  {conceptStatus(s)}
                </span>
                <span>{s?.attempts || 0}</span>
                <span>
                  {s?.noHintAttempts
                    ? `${Math.round((s.noHintCorrect / s.noHintAttempts) * 100)}%`
                    : "—"}
                </span>
                <span>
                  {s?.attempts
                    ? `${Math.round(s.totalMs / s.attempts / 1000)}s`
                    : "—"}
                </span>
                <button
                  className="text-button"
                  aria-label={`Practice ${t.name}`}
                  onClick={() => onTrain(t.id)}
                >
                  Practice
                  <ArrowRight size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <div className="progress-notes">
        <div>
          <h3>
            <RotateCcw size={18} />
            How review works
          </h3>
          <p>
            Misses and uncertain answers return sooner. Confident mistakes get
            extra attention. Repeated unaided success spaces a concept out.
          </p>
        </div>
        <div>
          <h3>
            <Cpu size={18} />
            Assistance fades with evidence
          </h3>
          <p>
            Guided practice offers hints and tracing. Consistent unaided answers
            reduce help; independent rounds use a scratchpad. Exams always
            remove help.
          </p>
        </div>
      </div>
      <Roadmap phase={phase} />
      <section className="achievements">
        <h2>Milestones</h2>
        {[
          {
            name: "First mission",
            done: progress.sessions >= 1,
            note: "Complete a training session.",
          },
          {
            name: "Steady practice",
            done: progress.studyDays.length >= 7,
            note: "Study on seven different days.",
          },
          {
            name: "Exam target reached",
            done: (bestExam(progress) || 0) >= progress.settings.targetScore,
            note: `Score ${progress.settings.targetScore}% on a mock.`,
          },
        ].map((m) => (
          <div key={m.name} className={m.done ? "earned" : ""}>
            {m.done ? <Trophy size={22} /> : <LockKeyhole size={22} />}
            <div>
              <b>{m.name}</b>
              <span>{m.note}</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
function Exams({
  progress,
  onStart,
  onResult,
}: {
  progress: Progress;
  onStart: () => void;
  onResult: (r: ExamResult) => void;
}) {
  const exams = progress.exams.filter((e) => e.kind === "exam");
  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE EXAM ROOM</span>
          <h1>
            See what holds up
            <br />
            <span>under pressure.</span>
          </h1>
        </div>
        <GraduationCap size={54} className="muted" />
      </div>
      <section className="exam-invitation">
        <div>
          <span className="eyebrow">PYTHON BASICS · MIXED TOPICS</span>
          <h2>Your next mock exam.</h2>
          <p>
            One question at a time. No hints or execution assistance. Review
            every answer after submission.
          </p>
          <div className="mission-meta">
            <span>
              <Target size={17} />
              {EXAM_QUESTIONS} questions
            </span>
            <span>
              <Clock3 size={17} />
              {EXAM_MINUTES} minutes
            </span>
            <span>
              <LockKeyhole size={17} />
              No assistance
            </span>
          </div>
          <button className="primary start-cta" onClick={onStart}>
            {progress.activeAssessment
              ? "Resume assessment"
              : "Start mock exam"}
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="exam-target">
          <span>PRACTICE TARGET</span>
          <strong>
            {progress.settings.targetScore}
            <small>%</small>
          </strong>
          <p>
            A useful marker.
            <br />
            Not a guarantee of passing.
          </p>
        </div>
      </section>
      <section className="exam-history">
        <div className="section-heading">
          <h2>Mock exam history</h2>
          <span>{exams.length} completed</span>
        </div>
        {exams.length ? (
          <>
            <div
              className="history-chart"
              aria-label="Mock exam scores over time"
            >
              {exams.slice(-8).map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => onResult(e)}
                  aria-label={`Review mock exam score ${e.score} percent`}
                >
                  <b>{e.score}%</b>
                  <div>
                    <span style={{ height: `${Math.max(e.score, 2)}%` }} />
                  </div>
                  <span>
                    {new Date(e.at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <small>EXAM {Math.max(exams.length - 8, 0) + i + 1}</small>
                </button>
              ))}
            </div>
            <div className="history-list">
              {[...exams]
                .reverse()
                .slice(0, 12)
                .map((e, i) => (
                  <button key={e.id} onClick={() => onResult(e)}>
                    <span>
                      Mock exam {exams.length - i}
                      <small>{new Date(e.at).toLocaleString()}</small>
                    </span>
                    <b>{e.score}%</b>
                    <span>{minutes(e.elapsedMs)} min</span>
                    <ArrowRight size={17} />
                  </button>
                ))}
            </div>
          </>
        ) : (
          <div className="empty-exams">
            <Gauge size={34} />
            <div>
              <h3>Your first score belongs here.</h3>
              <p>
                Take a mock when you’re ready. This timeline fills with your
                actual results.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
function Preferences({
  progress,
  onSave,
}: {
  progress: Progress;
  onSave: (s: Progress["settings"]) => void;
}) {
  const [settings, setSettings] = useState(progress.settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  function save() {
    if (
      !Number.isFinite(settings.targetScore) ||
      settings.targetScore < 20 ||
      settings.targetScore > 100 ||
      !Number.isInteger(settings.targetScore) ||
      Object.values(settings.weights).some(
        (w) => !Number.isFinite(w) || w < 0 || w > 100,
      ) ||
      Object.values(settings.weights).reduce((a, b) => a + b, 0) === 0
    ) {
      setError(
        "Use a target from 20 to 100 and topic weights from 0 to 100, with at least one positive weight.",
      );
      return;
    }
    setError("");
    onSave(settings);
    setSaved(true);
  }
  return (
    <div className="preferences-screen">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SET YOUR PACE</span>
          <h1>Preferences.</h1>
          <p>A few simple choices. Your practice stays yours.</p>
        </div>
      </div>
      <section className="settings-section">
        <div>
          <h2>Daily mission</h2>
          <p>Choose a session that fits your day.</p>
        </div>
        <div className="session-lengths">
          {(
            [
              { n: 6, name: "Quick", time: "5–8 min" },
              { n: 12, name: "Standard", time: "12–18 min" },
              { n: 20, name: "Focused", time: "25–30 min" },
            ] as const
          ).map((s) => (
            <button
              key={s.n}
              className={settings.sessionLength === s.n ? "active" : ""}
              onClick={() => {
                setSettings({ ...settings, sessionLength: s.n });
                setSaved(false);
              }}
            >
              <b>{s.name}</b>
              <span>
                {s.time} · {s.n} challenges
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Practice target</h2>
          <p>Change this when you learn the employer’s passing score.</p>
        </div>
        <label>
          Mock exam target (%)
          <input
            type="number"
            min={20}
            max={100}
            value={settings.targetScore}
            onChange={(e) => {
              setSettings({ ...settings, targetScore: Number(e.target.value) });
              setSaved(false);
            }}
          />
        </label>
      </section>
      <section className="settings-section">
        <div>
          <h2>Reading size</h2>
          <p>Increase the interface and code text together.</p>
        </div>
        <div>
          <label htmlFor="text-size">Text size</label>
          <select
            id="text-size"
            aria-label="Text size"
            value={settings.textScale}
            onChange={(e) => {
              setSettings({ ...settings, textScale: Number(e.target.value) });
              setSaved(false);
            }}
          >
            <option value={1}>Standard · 100%</option>
            <option value={1.125}>Larger · 112.5%</option>
            <option value={1.25}>Largest · 125%</option>
          </select>
        </div>
      </section>
      <section className="settings-section blueprint-settings">
        <div>
          <h2>Exam blueprint</h2>
          <p>
            Relative weights influence mixed missions and mock exams. They do
            not need to total 100. A weight of zero excludes the topic from
            mixed selection.
          </p>
        </div>
        <div className="weight-fields">
          {topics.map((t) => (
            <label key={t.id}>
              {t.name}
              <input
                type="number"
                min={0}
                max={100}
                value={settings.weights[t.id]}
                onChange={(e) => {
                  setSettings({
                    ...settings,
                    weights: {
                      ...settings.weights,
                      [t.id]: Number(e.target.value),
                    },
                  });
                  setSaved(false);
                }}
              />
            </label>
          ))}
        </div>
      </section>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="settings-save">
        <button className="primary" onClick={save}>
          {saved ? <Check size={18} /> : <Settings2 size={18} />}Save
          preferences
        </button>
        {saved && <span role="status">Preferences applied.</span>}
      </div>
      <p className="footnote">
        Progress is stored in the desktop app’s local database. No account or
        network connection is needed to study.
      </p>
    </div>
  );
}
function SessionSummary({
  data,
  progress,
  onNext,
  onHome,
}: {
  data: { correct: number; total: number; elapsedMs: number; hints: number };
  progress: Progress;
  onNext: () => void;
  onHome: () => void;
}) {
  return (
    <div className="session-summary">
      <div className="summary-mark">
        <Check size={48} />
      </div>
      <span className="eyebrow">MISSION COMPLETE</span>
      <h1>Another piece clicked.</h1>
      <p>
        You practiced reading Python, followed its decisions, and made your next
        session a little smarter.
      </p>
      <div className="summary-stats">
        <div>
          <b>
            {data.correct}
            <span>/{data.total}</span>
          </b>
          <span>predictions correct</span>
        </div>
        <div>
          <b>{minutes(data.elapsedMs)}</b>
          <span>minutes invested</span>
        </div>
        <div>
          <b>{progress.xp}</b>
          <span>total XP earned</span>
        </div>
      </div>
      <div className="summary-note">
        <CircleHelp size={20} />
        <span>
          {data.correct === data.total
            ? "A clean run. Your next mission will keep mixing concepts to test understanding."
            : "Missed and uncertain concepts are queued for another look. That is how this gets easier."}
        </span>
      </div>
      <div className="actions">
        <button className="primary" onClick={onHome}>
          Back to mission control
          <ArrowRight size={18} />
        </button>
        <button className="ghost" onClick={onNext}>
          One more mission
        </button>
      </div>
    </div>
  );
}
