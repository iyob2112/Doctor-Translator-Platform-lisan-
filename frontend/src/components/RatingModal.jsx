import { useState } from "react";
import Icon from "./Icon.jsx";

const labels = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Great",
  5: "Excellent",
};

const problems = [
  "Network lagging",
  "Video froze",
  "Audio cutting out",
  "Hard to hear",
  "Call dropped",
  "Interpreter late",
  "Wrong language",
  "No problems",
];

export default function RatingModal({ open, onSubmit, onSkip }) {
  const [rating, setRating] = useState(0);
  const [selected, setSelected] = useState([]);
  if (!open) return null;

  function toggleProblem(item) {
    setSelected((current) => {
      if (item === "No problems") return current.includes(item) ? [] : ["No problems"];
      const withoutNone = current.filter((value) => value !== "No problems");
      return withoutNone.includes(item)
        ? withoutNone.filter((value) => value !== item)
        : [...withoutNone, item];
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-md animate-pop-in rounded-4xl bg-white p-7 shadow-lift"
        onSubmit={(e) => {
          e.preventDefault();
          if (!rating) return;
          onSubmit({
            rating,
            comment: selected.filter((item) => item !== "No problems").join(" · ") || "",
          });
        }}
      >
        <p className="label">After the consult</p>
        <h2 className="mt-2 font-display text-2xl">Rate this interpreter</h2>
        <p className="mt-2 text-sm text-slate-500">Tap the stars, then choose any problems.</p>

        <div className="mt-6 flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => {
            const on = value <= rating;
            return (
              <button
                type="button"
                key={value}
                onClick={() => setRating(value)}
                className="grid h-12 w-12 place-items-center rounded-2xl transition hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
              >
                <Icon
                  name="star"
                  fill={on ? "currentColor" : "none"}
                  className={`h-9 w-9 ${on ? "text-amber-400" : "text-slate-300"}`}
                  strokeWidth={1.4}
                />
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-sm font-semibold text-ink">
          {rating ? `${rating} · ${labels[rating]}` : "Tap a star"}
        </p>

        <p className="label mt-6">Problems</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {problems.map((item) => {
            const on = selected.includes(item);
            return (
              <button
                type="button"
                key={item}
                onClick={() => toggleProblem(item)}
                className={on ? "chip-on" : "chip-off"}
              >
                {on ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                {item}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={!rating} className="btn-dark flex-1 py-3 disabled:opacity-40">
            Save rating
          </button>
          <button type="button" onClick={onSkip} className="btn-ghost flex-1 py-3">
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}
