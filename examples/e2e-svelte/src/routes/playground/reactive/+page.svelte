<script lang="ts">
  import { RuntimeTrans } from "lingui-for-svelte";
  import { t } from "lingui-for-svelte/macro";

  import {
    decrementReactiveCount,
    incrementReactiveCount,
    reactiveDescriptor,
    reactiveState,
    setReactiveName,
    toggleReactiveStatus,
  } from "$lib/playground/reactive-state.svelte";

  const topLevelGreeting = $t`Hello ${reactiveState.name} from the reactive route.`;
  const topLevelCount = $t`Count: ${reactiveState.count}`;
  const derivedStatus = $derived.by(() =>
    reactiveState.status === "idle" ? $t`Idle` : $t`Active`,
  );
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Reactive`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`$t and rune-backed state`}
    </h1>
    <p class="text-base-content/80">
      {$t`This route isolates reactive string macros and state that lives in a .svelte.ts module.`}
    </p>

    <div class="grid gap-4 lg:grid-cols-2">
      <label class="form-control gap-2">
        <span class="label-text font-semibold">{$t`Name`}</span>
        <input
          bind:value={reactiveState.name}
          class="input input-bordered"
          oninput={(event) =>
            setReactiveName((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="form-control gap-2">
        <span class="label-text font-semibold">{$t`Count`}</span>
        <input
          bind:value={reactiveState.count}
          class="input input-bordered"
          min="0"
          type="number"
        />
      </label>
    </div>

    <div class="flex flex-wrap gap-3">
      <button
        class="btn btn-outline btn-primary"
        onclick={decrementReactiveCount}
        type="button"
      >
        {$t`Decrease`}
      </button>
      <button
        class="btn btn-primary"
        onclick={incrementReactiveCount}
        type="button"
      >
        {$t`Increase`}
      </button>
      <button
        class="btn btn-secondary"
        onclick={toggleReactiveStatus}
        type="button"
      >
        {$t`Toggle status`}
      </button>
    </div>

    <div class="space-y-3 text-lg">
      <p>{topLevelGreeting}</p>
      <p>{topLevelCount}</p>
      <p>
        {$t`Current status`}:
        <strong class="font-semibold">{derivedStatus}</strong>
      </p>
      <p><RuntimeTrans message={reactiveDescriptor} /></p>
    </div>
  </div>
</section>
