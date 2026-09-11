import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Cpu,
  Terminal,
  Layers,
  AlertTriangle,
} from "lucide-react";
import type { TraceResult } from "../types";
import { CodeBlock } from "./CodeBlock";
export function PythonMachine({
  trace,
  code,
  snapshotOnly,
}: {
  trace: TraceResult;
  code: string;
  snapshotOnly?: boolean;
}) {
  const [position, setPosition] = useState(-1);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const event = trace.events[position];
  const end = position === trace.events.length - 1;
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest('input, textarea, select, [contenteditable="true"]'))
      )
        return;
      if (e.code === "Space") {
        if (e.target instanceof Element && e.target.closest("button")) return;
        e.preventDefault();
        setPosition((p) => Math.min(p + 1, trace.events.length - 1));
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        setPosition(-1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [trace.events.length]);
  const changes = event?.changes ?? [];
  return (
    <div className="machine" data-testid="python-machine">
      <div className="machine-title">
        <div>
          <Cpu size={20} />
          <h2 ref={title} tabIndex={-1}>
            Python Machine
          </h2>
          <span className="tag">REAL EXECUTION</span>
        </div>
        <span className="mono">
          {position < 0
            ? "READY"
            : `STEP ${position + 1} / ${trace.events.length}`}
        </span>
      </div>
      {snapshotOnly && (
        <p className="machine-scope-note">
          Comprehensions run as one expression here. You’ll see the completed
          list, rather than each internal iteration.
        </p>
      )}
      <div className="machine-grid">
        <CodeBlock code={code} currentLine={event?.line} />
        <div className="machine-state">
          <div className="state-top">
            <span className="eyebrow">
              {event ? event.event.toUpperCase() : "BEFORE EXECUTION"}
            </span>
            {event?.iteration && (
              <span className="tag">Iteration {event.iteration}</span>
            )}
          </div>
          <p className="event-detail" aria-live="polite">
            {event?.detail ||
              "Step forward to watch Python change its state. Each highlighted line has just executed."}
          </p>
          <div className="variables">
            <h3>
              Variables <span>{event?.function || "<module>"}</span>
            </h3>
            {event && Object.keys(event.locals).length ? (
              Object.entries(event.locals).map(([name, value]) => {
                const change = changes.find((c) => c.name === name);
                return (
                  <div
                    className={`variable ${change ? "changed" : ""}`}
                    key={name}
                  >
                    <code>{name}</code>
                    <div>
                      {change &&
                        change.before !== null &&
                        change.before !== value && (
                          <>
                            <code className="previous">{change.before}</code>
                            <ArrowRight size={12} />
                          </>
                        )}
                      <code>{value}</code>
                      {change && (
                        <span className="change-label">
                          {change.before === null ? "NEW" : "CHANGED"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="empty-state">No variables yet.</p>
            )}
          </div>
          {event &&
            event.function !== "<module>" &&
            Object.keys(event.globals).length > 0 && (
              <details>
                <summary>Global state</summary>
                {Object.entries(event.globals).map(([name, value]) => (
                  <div className="variable" key={name}>
                    <code>{name}</code>
                    <code>{value}</code>
                  </div>
                ))}
              </details>
            )}
          {event?.parameters && Object.keys(event.parameters).length > 0 && (
            <div className="call-parameters">
              <h3>Arguments → parameters</h3>
              {Object.entries(event.parameters).map(([name, value]) => (
                <div className="variable" key={name}>
                  <code>{value}</code>
                  <ArrowRight size={14} />
                  <code>{name}</code>
                </div>
              ))}
            </div>
          )}
          {event?.returnValue !== undefined && (
            <div className="return-value">
              <span>Return value</span>
              <code>{event.returnValue}</code>
            </div>
          )}
          {event && event.stack.length > 1 && (
            <div className="call-stack">
              <h3>
                <Layers size={14} />
                Call stack
              </h3>
              {event.stack.map((frame, i) => (
                <span key={i}>
                  {frame.function} <small>line {frame.line}</small>
                </span>
              ))}
            </div>
          )}
          <div className="stdout">
            <h3>
              <Terminal size={14} />
              Output
            </h3>
            <pre>
              {event?.output || (
                <span className="muted">Nothing printed yet.</span>
              )}
            </pre>
          </div>
        </div>
      </div>
      {trace.error && end && (
        <div className="notice error">
          <AlertTriangle size={18} />
          <span>
            <b>{trace.error.type}</b> at line {trace.error.line}:{" "}
            {trace.error.message}
          </span>
        </div>
      )}
      {trace.truncated && (
        <div className="notice error">
          Execution reached a safety limit. This trace is incomplete.
        </div>
      )}
      <div className="machine-controls">
        <button
          className="ghost"
          onClick={() => setPosition(-1)}
          disabled={position < 0}
        >
          <RotateCcw size={16} />
          Reset <kbd>R</kbd>
        </button>
        <div className="step-dots" aria-hidden="true">
          {trace.events.map((_, i) => (
            <span key={i} className={i <= position ? "filled" : ""} />
          ))}
        </div>
        <button
          className="secondary"
          aria-label="Previous execution step"
          disabled={position < 0}
          onClick={() => setPosition((p) => p - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="primary"
          disabled={end}
          onClick={() => setPosition((p) => p + 1)}
        >
          {end ? "Execution complete" : "Next step"}
          <ArrowRight size={17} />
          <kbd>Space</kbd>
        </button>
      </div>
    </div>
  );
}
