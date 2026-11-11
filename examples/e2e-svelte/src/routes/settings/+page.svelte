<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t } from "lingui-for-svelte/macro";

  import { page } from "$app/state";

  const currentLocaleLabel = $derived(
    page.data.locale === "ja" ? $t`Japanese` : $t`English`,
  );
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-xl")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Preferences`}
    </p>
    <h1 {...style("font-black text-4xl md:text-6xl")}>
      {$t`Language preference`}
    </h1>
    <p {...style("text-base-content/80 md:text-lg")}>
      {$t`Choose a language with the switcher in the header. The server stores your preference in a cookie so new routes keep the same locale.`}
    </p>
    <div
      {...style(
        "stats stats-vertical bg-base-200 border border-base-300 md:stats-horizontal",
      )}
    >
      <div {...style("stat")}>
        <div {...style("stat-title")}>{$t`Current language`}</div>
        <div {...style("stat-value text-primary")}>{currentLocaleLabel}</div>
      </div>
    </div>
    <p {...style("text-base-content/75")}>
      {$t`The application routes are intentionally small. Macro edge cases live under the playground instead of leaking into the main app.`}
    </p>
  </div>
</section>
