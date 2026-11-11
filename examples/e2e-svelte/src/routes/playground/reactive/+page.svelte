<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t } from "lingui-for-svelte/macro";

  import {
    decrementReactiveCount,
    incrementReactiveCount,
    reactiveState,
    setReactiveName,
    toggleReactiveStatus,
  } from "$lib/playground/reactive-state.svelte";

  const topLevelGreeting = $derived(
    $t`Hello ${reactiveState.name} from the reactive route.`,
  );
  const topLevelCount = $derived($t`Count: ${reactiveState.count}`);
  const derivedStatus = $derived.by(() =>
    reactiveState.status === "idle" ? $t`Idle` : $t`Active`,
  );
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Reactive`}
    </p>
    <h1 {...style("font-black text-4xl md:text-5xl")}>
      {$t`$t and rune-backed state`}
    </h1>
    <p {...style("text-base-content/80")}>
      {$t`This route isolates reactive string macros and state that lives in a .svelte.ts module.`}
    </p>

    <div {...style("grid gap-4 lg:grid-cols-2")}>
      <label {...style("gap-2")}>
        <span {...style("font-semibold")}>{$t`Name`}</span>
        <input
          bind:value={reactiveState.name}
          {...style("input")}
          oninput={(event) =>
            setReactiveName((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label {...style("gap-2")}>
        <span {...style("font-semibold")}>{$t`Count`}</span>
        <input
          bind:value={reactiveState.count}
          {...style("input")}
          min="0"
          type="number"
        />
      </label>
    </div>

    <div {...style("flex flex-wrap gap-3")}>
      <button
        {...style("btn btn-outline btn-primary")}
        onclick={decrementReactiveCount}
        type="button"
      >
        {$t`Decrease`}
      </button>
      <button
        {...style("btn btn-primary")}
        onclick={incrementReactiveCount}
        type="button"
      >
        {$t`Increase`}
      </button>
      <button
        {...style("btn btn-secondary")}
        onclick={toggleReactiveStatus}
        type="button"
      >
        {$t`Toggle status`}
      </button>
    </div>

    <div {...style("space-y-3 text-lg")}>
      <p>{topLevelGreeting}</p>
      <p>{topLevelCount}</p>
      <p>
        {$t`Current status`}:
        <strong {...style("font-semibold")}>{derivedStatus}</strong>
      </p>
    </div>
  </div>
</section>
