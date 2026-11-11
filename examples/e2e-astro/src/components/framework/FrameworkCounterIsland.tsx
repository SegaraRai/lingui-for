import { style } from "stillwind/react";
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
      {...style("rounded-box p-4 border border-base-300")}
      data-testid={`framework-${mode}-panel`}
    >
      <p {...style("font-semibold")} data-testid={`framework-${mode}-label`}>
        {label}
      </p>
      <div {...style("flex mt-3 items-center gap-3")}>
        <button
          {...style("btn btn-primary btn-sm")}
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
