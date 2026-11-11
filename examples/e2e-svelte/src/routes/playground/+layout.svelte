<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t } from "lingui-for-svelte/macro";

  import PlaygroundNav from "$lib/app/PlaygroundNav.svelte";

  let { children } = $props();
</script>

<section {...style("space-y-6")}>
  <header {...style("card bg-base-100 border border-base-300 shadow-lg")}>
    <div {...style("card-body gap-4")}>
      <p
        {...style(
          "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
        )}
      >
        {$t`Playground`}
      </p>
      <h1 {...style("font-black text-4xl md:text-6xl")}>
        {$t`Focused routes for library verification`}
      </h1>
      <p {...style("text-base-content/80 md:text-lg")}>
        {$t`Each route keeps one category of Lingui-for-Svelte behavior easy to inspect, extract, compile, and test.`}
      </p>
    </div>
  </header>

  <PlaygroundNav />

  <div {...style("space-y-6")}>
    {@render children?.()}
  </div>
</section>
