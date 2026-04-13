import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const LIGHT_KEYS = [
  ["AC", "±", "%", "⌫"],
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "−"],
  ["0", ".", "+", "="],
];

const DARK_KEYS = [
  ["sc", "sin", "deg", "%"],
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "+"],
  ["0", ".", "=", "⌫"],
];

function formatDisplay(value) {
  if (!value) return "0";
  return value.length > 18 ? value.slice(-18) : value;
}

function normalizeExpression(value, degreeMode) {
  return value
    .replace(/÷/g, "/")
    .replace(/×/g, "*")
    .replace(/−/g, "-")
    .replace(/sin\(([^)]+)\)/g, (_, inner) => `Math.sin((${inner})${degreeMode ? " * Math.PI / 180" : ""})`);
}

function safeEvaluate(value, degreeMode) {
  const normalized = normalizeExpression(value, degreeMode);
  if (!/^[0-9+\-*/%.()\sMathsinPI]+$/.test(normalized.replace(/\b(Math|sin|PI)\b/g, "$1"))) {
    throw new Error("Invalid expression");
  }
  const result = Function(`"use strict"; return (${normalized});`)();
  if (!Number.isFinite(result)) throw new Error("Invalid result");
  return result;
}

function SupplierCalculatorPage() {
  const [expression, setExpression] = useState("6000/2+32.77*2");
  const [result, setResult] = useState("12465.54");
  const [degreeMode, setDegreeMode] = useState(true);

  const displayExpression = useMemo(() => formatDisplay(expression), [expression]);
  const displayResult = useMemo(() => {
    const value = Number(result);
    if (Number.isFinite(value)) {
      return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
    }
    return result;
  }, [result]);

  const commitEvaluation = (nextExpression = expression) => {
    try {
      const evaluated = safeEvaluate(nextExpression, degreeMode);
      setResult(String(evaluated));
      return String(evaluated);
    } catch {
      setResult("Error");
      return "Error";
    }
  };

  const appendToken = (token) => {
    if (token === "sc") {
      setExpression("");
      setResult("0");
      return;
    }

    if (token === "deg") {
      setDegreeMode((current) => !current);
      return;
    }

    if (token === "AC") {
      setExpression("");
      setResult("0");
      return;
    }

    if (token === "⌫") {
      setExpression((current) => current.slice(0, -1));
      return;
    }

    if (token === "±") {
      setExpression((current) => {
        if (!current) return "-";
        return current.startsWith("-") ? current.slice(1) : `-${current}`;
      });
      return;
    }

    if (token === "%") {
      setExpression((current) => (current ? `${current}/100` : current));
      return;
    }

    if (token === "sin") {
      setExpression((current) => `${current}${current ? "+" : ""}sin(`);
      return;
    }

    if (token === "=") {
      const evaluated = commitEvaluation();
      if (evaluated !== "Error") setExpression(evaluated);
      return;
    }

    const mappedToken = token === "×" || token === "÷" || token === "−" ? token : token;
    setExpression((current) => `${current}${mappedToken}`);
  };

  return (
    <section className="page-wrap supplier-calculator-page">
      <div className="calculator-hero">
        <div className="calculator-hero-copy">
          <p className="auth-eyebrow">Supplier Tools</p>
          <h2>Calculator</h2>
          <p className="muted">A real working supplier calculator with the dual light and dark concept style.</p>
        </div>
        <div className="row">
          <Link className="ghost-btn" to="/supplier/dashboard">
            Back Dashboard
          </Link>
        </div>
      </div>

      <div className="calculator-stage">
        <div className="calculator-orb" aria-hidden="true" />

        <article className="supplier-calculator-card supplier-calculator-card-light">
          <div className="supplier-calculator-display">
            <p>{displayExpression || "0"}</p>
            <h3>={displayResult}</h3>
          </div>
          <div className="supplier-calculator-grid">
            {LIGHT_KEYS.flat().map((key) => (
              <button
                key={`light-${key}`}
                type="button"
                className={`calculator-key${key === "=" ? " equals" : ""}${["÷", "×", "−", "+", "⌫"].includes(key) ? " operator" : ""}`}
                onClick={() => appendToken(key)}
              >
                {key}
              </button>
            ))}
          </div>
        </article>

        <article className="supplier-calculator-card supplier-calculator-card-dark">
          <div className="supplier-calculator-display">
            <p>{displayExpression || "0"}</p>
            <h3>={displayResult}</h3>
            <span>{degreeMode ? "Degree Mode" : "Radian Mode"}</span>
          </div>
          <div className="supplier-calculator-grid">
            {DARK_KEYS.flat().map((key) => (
              <button
                key={`dark-${key}`}
                type="button"
                className={`calculator-key${key === "=" ? " equals" : ""}${["÷", "×", "−", "+", "⌫"].includes(key) ? " operator" : ""}${["sc", "sin", "deg"].includes(key) ? " utility" : ""}`}
                onClick={() => appendToken(key)}
              >
                {key === "deg" ? (degreeMode ? "deg" : "rad") : key}
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export default SupplierCalculatorPage;
