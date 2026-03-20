<script lang="ts">
  import { setLinguiContext } from "lingui-for-svelte";

  import AppShell from "$lib/app/AppShell.svelte";
  import { appI18n, ensureLocale } from "$lib/i18n/session.svelte";
  import type { SupportedLocale } from "$lib/i18n/locale";

  import "../app.css";

  let { data, children } = $props();
  setLinguiContext(appI18n);

  function currentLocale(): SupportedLocale {
    return data.locale;
  }

  ensureLocale(currentLocale());

  $effect(() => {
    ensureLocale(currentLocale());
    document.documentElement.lang = currentLocale();
  });
</script>

<AppShell locale={currentLocale()}>
  {@render children?.()}
</AppShell>
