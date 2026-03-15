<script lang="ts">
  import { page } from "$app/state";
  import { t } from "lingui-for-svelte/macro";

  const currentLocaleLabel = $derived(
    page.data.locale === "ja" ? $t`Japanese` : $t`English`,
  );
</script>

<section class="card border-base-300 bg-base-100 border shadow-xl">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Preferences`}
    </p>
    <h1 class="text-4xl font-black md:text-6xl">{$t`Language preference`}</h1>
    <p class="text-base-content/80 md:text-lg">
      {$t`Choose a language with the switcher in the header. The server stores your preference in a cookie so new routes keep the same locale.`}
    </p>
    <div
      class="stats stats-vertical border-base-300 bg-base-200 md:stats-horizontal border"
    >
      <div class="stat">
        <div class="stat-title">{$t`Current language`}</div>
        <div class="stat-value text-primary">{currentLocaleLabel}</div>
      </div>
    </div>
    <p class="text-base-content/75">
      {$t`The application routes are intentionally small. Macro edge cases live under the playground instead of leaking into the main app.`}
    </p>
  </div>
</section>
