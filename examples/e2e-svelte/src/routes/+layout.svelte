<script lang="ts">
  import AppShell from "$lib/components/AppShell.svelte";
  import { appI18n, ensureLocale } from "$lib/i18n/session.svelte";
  import type { SupportedLocale } from "$lib/i18n/session.svelte";
  import { setLinguiContext } from "lingui-for-svelte/runtime";

  let { data, children } = $props();
  setLinguiContext(appI18n);

  function currentLocale(): SupportedLocale {
    return data.locale;
  }

  ensureLocale(currentLocale());

  $effect(() => {
    ensureLocale(currentLocale());
  });
</script>

<AppShell locale={currentLocale()}>
  {@render children?.()}
</AppShell>
