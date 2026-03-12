<script lang="ts">
  import { localeLabels } from "$lib/i18n/messages";
  import {
    activateLocale,
    formatDescriptor,
    localeState,
    supportedLocales,
    type SupportedLocale,
  } from "$lib/i18n/session.svelte";
</script>

<div class="switcher" aria-label="Locale switcher">
  {#each supportedLocales as locale}
    <button
      class:active={localeState.current === locale}
      onclick={() => activateLocale(locale as SupportedLocale)}
      type="button"
    >
      {formatDescriptor(localeLabels[locale])}
    </button>
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

  button {
    border: 0;
    border-radius: 999px;
    padding: 0.55rem 0.9rem;
    background: transparent;
    color: #694729;
    font: inherit;
    cursor: pointer;
  }

  button.active {
    background: #201914;
    color: #fff6ec;
  }
</style>
