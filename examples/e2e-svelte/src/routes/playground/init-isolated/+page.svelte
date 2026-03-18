<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  import IsolatedWidget from "./IsolatedWidget.svelte";
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Init: Isolated`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`Isolated sub-context`}
    </h1>
    <p class="text-base-content/80">
      {$t`A child component can call setLinguiContext with its own i18n instance. Its subtree uses that context instead of the parent's.`}
    </p>
    <p class="text-base-content/60 text-sm">
      {$t`Switch the app locale using the header. The isolated widget below stays in English.`}
    </p>

    <div class="space-y-2 text-lg">
      <p>{$t`This line follows the app locale.`}</p>
    </div>

    <IsolatedWidget />
  </div>
</section>
