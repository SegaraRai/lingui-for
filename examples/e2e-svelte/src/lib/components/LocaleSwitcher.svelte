<script lang="ts">
  import { page } from "$app/state";
  import { t } from "lingui-for-svelte/macro";
  import { localeLabels } from "$lib/i18n/messages";
  import type { SupportedLocale } from "$lib/i18n/session.svelte";
  import { supportedLocales } from "$lib/i18n/session.svelte";

  let { locale } = $props<{ locale: SupportedLocale }>();

  function buildLocaleHref(locale: string): string {
    const query = new URLSearchParams(page.url.searchParams);
    query.set("lang", locale);
    return `${page.url.pathname}?${query.toString()}`;
  }
</script>

<div class="switcher" aria-label="Locale switcher">
  {#each supportedLocales as supportedLocale}
    <a
      href={buildLocaleHref(supportedLocale)}
      class:active={supportedLocale === locale}
    >
      {$t(localeLabels[supportedLocale])}
    </a>
  {/each}
</div>

<style>
  .switcher {
    display: inline-flex;
    gap: 0.4rem;
    padding: 0.35rem;
    border-radius: 999px;
    background: rgba(255, 249, 240, 0.78);
    border: 1px solid rgba(31, 26, 20, 0.1);
  }

  a {
    display: inline-flex;
    align-items: center;
    border: 0;
    border-radius: 999px;
    padding: 0.55rem 0.9rem;
    background: transparent;
    color: #694729;
    font: inherit;
    cursor: pointer;
    text-decoration: none;
  }

  a.active {
    background: #201914;
    color: #fff6ec;
  }
</style>
