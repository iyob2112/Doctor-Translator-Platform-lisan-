import Icon from "./Icon.jsx";

const reasons = [
  "Tired / need a break",
  "Network lagging",
  "Audio problem",
  "Video problem",
  "Wrong language",
  "Need another interpreter",
  "No reason",
];

export default function TransferModal({
  open,
  title,
  language,
  reason,
  onReason,
  onSubmit,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-md animate-pop-in rounded-4xl bg-white p-7 text-ink shadow-lift"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-plum-50 text-plum-600">
          <Icon name="transfer" className="h-5 w-5" />
        </span>
        <h2 className="mt-4 font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">
          Other online interpreters for {language} will be paged. The first to accept takes over.
          Stay on the call until they join.
        </p>
        <p className="label mt-5">Why</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {reasons.map((item) => {
            const on = reason === item;
            return (
              <button
                type="button"
                key={item}
                onClick={() => onReason(item === "No reason" ? "" : item)}
                className={on || (item === "No reason" && !reason) ? "chip-on" : "chip-off"}
              >
                {on || (item === "No reason" && !reason) ? (
                  <Icon name="check" className="h-3.5 w-3.5" />
                ) : null}
                {item}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex gap-3">
          <button className="btn-dark flex-1 py-3">Page interpreters</button>
          <button type="button" onClick={onCancel} className="btn-ghost flex-1 py-3">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
