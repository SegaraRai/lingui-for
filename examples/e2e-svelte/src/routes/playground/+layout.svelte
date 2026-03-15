<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  import PlaygroundNav from "$lib/app/PlaygroundNav.svelte";

  let { children } = $props();
</script>

<section class="space-y-6">
  <header class="card border-base-300 bg-base-100 border shadow-lg">
    <div class="card-body gap-4">
      <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
        {$t`Playground`}
      </p>
      <h1 class="text-4xl font-black md:text-6xl">
        {$t`Focused routes for library verification`}
      </h1>
      <p class="text-base-content/80 md:text-lg">
        {$t`Each route keeps one category of Lingui-for-Svelte behavior easy to inspect, extract, compile, and test.`}
      </p>
    </div>
  </header>

  <PlaygroundNav />

  <div class="space-y-6">
    {@render children?.()}
  </div>
</section>
