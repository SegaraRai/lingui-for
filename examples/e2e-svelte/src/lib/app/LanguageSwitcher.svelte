<script lang="ts">
  import { page } from "$app/state";
  import { t } from "lingui-for-svelte/macro";

  import { supportedLocales, type SupportedLocale } from "$lib/i18n/locale";

  let { locale } = $props<{ locale: SupportedLocale }>();

  function buildLocaleHref(nextLocale: SupportedLocale): string {
    const query = new URLSearchParams(page.url.searchParams);
    query.set("lang", nextLocale);
    return `${page.url.pathname}?${query.toString()}`;
  }
</script>

<div class="join" aria-label={$t`Switch language`}>
  {#each supportedLocales as supportedLocale}
    <a
      href={buildLocaleHref(supportedLocale)}
      class="btn btn-sm join-item"
      class:btn-primary={supportedLocale === locale}
      class:btn-ghost={supportedLocale !== locale}
    >
      {#if supportedLocale === "en"}
        {$t`English`}
      {:else}
        {$t`Japanese`}
      {/if}
    </a>
  {/each}
</div>
