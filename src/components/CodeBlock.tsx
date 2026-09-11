import { Fragment } from "react";
const tokens =
  /("[^"\n]*"|'[^'\n]*'|#.*$|\b(?:def|return|if|elif|else|for|in|while|break|continue|and|or|not|is|None|True|False|try|except|finally|raise|import|from|as|with|class|pass|global|lambda)\b|\b(?:print|range|len|sum|int|str|float|bool|list|dict|set|tuple|enumerate|sorted|open|round|zip|min|max|abs)\b|\b\d+(?:\.\d+)?\b)/g;
function colorLine(line: string) {
  return line.split(tokens).map((part, i) => {
    let cls = "";
    if (/^["']/.test(part)) cls = "syntax-string";
    else if (part.startsWith("#")) cls = "syntax-comment";
    else if (/^\d/.test(part)) cls = "syntax-number";
    else if (
      /^(def|return|if|elif|else|for|in|while|break|continue|and|or|not|is|None|True|False|try|except|finally|raise|import|from|as|with|class|pass|global|lambda)$/.test(
        part,
      )
    )
      cls = "syntax-keyword";
    else if (
      /^(print|range|len|sum|int|str|float|bool|list|dict|set|tuple|enumerate|sorted|open|round|zip|min|max|abs)$/.test(
        part,
      )
    )
      cls = "syntax-builtin";
    return cls ? (
      <span key={i} className={cls}>
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
}
export function CodeBlock({
  code,
  currentLine,
  focusLine,
  label = "mission.py",
}: {
  code: string;
  currentLine?: number;
  focusLine?: number;
  label?: string;
}) {
  return (
    <section className="code-panel" aria-label="Python source code">
      <div className="code-heading">
        <span>
          <span className="python-mark">py</span>
          {label}
        </span>
        <span>PYTHON 3</span>
      </div>
      <pre tabIndex={0} aria-label="Code with line numbers">
        <code>
          {code.split("\n").map((line, i) => (
            <span
              key={i}
              className={`code-line ${currentLine === i + 1 ? "executing" : ""} ${focusLine === i + 1 && !currentLine ? "focus-line" : ""}`}
              aria-current={currentLine === i + 1 ? "step" : undefined}
            >
              <span className="line-number" aria-hidden="true">
                {i + 1}
              </span>
              <span className="line-text">{colorLine(line) || " "}</span>
            </span>
          ))}
        </code>
      </pre>
      <div className="code-foot">
        <span>{code.split("\n").length} lines</span>
        <span>
          {currentLine
            ? `Executing line ${currentLine}`
            : "Read from top to bottom."}
        </span>
      </div>
    </section>
  );
}
