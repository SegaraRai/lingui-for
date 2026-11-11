<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t } from "lingui-for-svelte/macro";

  import { page } from "$app/state";
  import { supportedLocales, type SupportedLocale } from "$lib/i18n/locale";

  let { locale } = $props<{ locale: SupportedLocale }>();

  function buildLocaleHref(nextLocale: SupportedLocale): string {
    const query = new URLSearchParams(page.url.searchParams);
    query.set("lang", nextLocale);
    return `${page.url.pathname}?${query.toString()}`;
  }
</script>

<div {...style("join")} aria-label={$t`Switch language`}>
  {#each supportedLocales as supportedLocale}
    <a
      href={buildLocaleHref(supportedLocale)}
      {...style(
        "btn btn-sm join-item",
        supportedLocale === locale ? "btn-primary" : "btn-ghost",
      )}
    >
      {#if supportedLocale === "en"}
        {$t`English`}
      {:else}
        {$t`Japanese`}
      {/if}
    </a>
  {/each}
</div>
