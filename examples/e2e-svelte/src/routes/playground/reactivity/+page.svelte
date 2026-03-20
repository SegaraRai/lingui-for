<script lang="ts">
  import { msg, t } from "lingui-for-svelte/macro";

  import {
    reactivityDemoState,
    setReactivityDemoValue,
  } from "$lib/playground/reactivity-demo.svelte";

  const scriptTaggedStatic = $derived($t`Script direct static reactivity.`);
  const scriptDescriptorStatic = $derived(
    $t(msg`Script descriptor static reactivity.`),
  );
  const scriptInterpolated = $derived(
    $t`Script value: ${reactivityDemoState.value}`,
  );
  const templateDescriptor = $derived(
    msg`Template indirect value: ${reactivityDemoState.value}`,
  );
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Reactivity`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`$t script and template reactivity`}
    </h1>
    <p class="text-base-content/80 md:text-lg">
      {$t`This route isolates locale and value tracking across direct and descriptor-based translations.`}
    </p>

    <div class="flex flex-wrap gap-3">
      <button
        class="btn btn-outline btn-primary"
        data-testid="value-alpha"
        onclick={() => setReactivityDemoValue("Alpha")}
        type="button"
      >
        {$t`Set Alpha`}
      </button>
      <button
        class="btn btn-primary"
        data-testid="value-beta"
        onclick={() => setReactivityDemoValue("Beta")}
        type="button"
      >
        {$t`Set Beta`}
      </button>
    </div>

    <p class="text-base-content/75" data-testid="current-value">
      {$t`Current demo value`}: <strong>{reactivityDemoState.value}</strong>
    </p>

    <div class="grid gap-4 xl:grid-cols-2">
      <article class="card border-base-300 bg-base-200 border">
        <div class="card-body gap-3">
          <h2 class="card-title text-2xl">{$t`Script bindings`}</h2>
          <p data-testid="script-tagged-static">{scriptTaggedStatic}</p>
          <p data-testid="script-descriptor-static">{scriptDescriptorStatic}</p>
          <p data-testid="script-interpolated">{scriptInterpolated}</p>
        </div>
      </article>

      <article class="card border-base-300 bg-base-200 border">
        <div class="card-body gap-3">
          <h2 class="card-title text-2xl">{$t`Template bindings`}</h2>
          <p data-testid="template-indirect">{$t(templateDescriptor)}</p>
          <p data-testid="template-direct">
            {$t`Template direct value: ${reactivityDemoState.value}`}
          </p>
          <p data-testid="template-static">
            {$t`Template static reactivity.`}
          </p>
        </div>
      </article>
    </div>
  </div>
</section>
