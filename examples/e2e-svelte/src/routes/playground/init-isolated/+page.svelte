<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t } from "lingui-for-svelte/macro";

  import IsolatedWidget from "./IsolatedWidget.svelte";
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Init: Isolated`}
    </p>
    <h1 {...style("font-black text-4xl md:text-5xl")}>
      {$t`Isolated sub-context`}
    </h1>
    <p {...style("text-base-content/80")}>
      {$t`A child component can call setLinguiContext with its own i18n instance. Its subtree uses that context instead of the parent's.`}
    </p>
    <p {...style("text-base-content/60 text-sm")}>
      {$t`Switch the app locale using the header. The isolated widget below stays in English.`}
    </p>

    <div {...style("space-y-2 text-lg")}>
      <p>{$t`This line follows the app locale.`}</p>
    </div>

    <IsolatedWidget />
  </div>
</section>
