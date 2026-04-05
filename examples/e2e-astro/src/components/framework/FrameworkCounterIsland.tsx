import { useState } from "react";

type FrameworkCounterMode = "direct" | "rendered" | "wrapped";

export default function FrameworkCounterIsland({
  mode,
  label,
}: {
  readonly mode: FrameworkCounterMode;
  readonly label: string;
}) {
  const [count, setCount] = useState(0);

  return (
    <section
      className="rounded-box border-base-300 border p-4"
      data-testid={`framework-${mode}-panel`}
    >
      <p className="font-semibold" data-testid={`framework-${mode}-label`}>
        {label}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          className="btn btn-sm btn-primary"
          data-testid={`framework-${mode}-increment`}
          onClick={() => setCount((current) => current + 1)}
        >
          Increment
        </button>
        <output data-testid={`framework-${mode}-count`}>{count} clicks</output>
      </div>
    </section>
  );
}
