<script lang="ts">
  import { t } from "lingui-for-svelte/macro";
  import type { Snippet } from "svelte";

  import LanguageSwitcher from "$lib/app/LanguageSwitcher.svelte";
  import type { SupportedLocale } from "$lib/i18n/locale";

  let {
    locale,
    children,
  }: {
    locale: SupportedLocale;
    children?: Snippet;
  } = $props();
</script>

<div class="shell">
  <header
    class="navbar sticky top-0 z-20 border-b border-base-300 bg-base-100/90 px-4 shadow-sm backdrop-blur md:px-6"
  >
    <a class="btn btn-ghost px-0 text-lg font-semibold" href="/">
      lingui-for-svelte
    </a>
    <nav class="flex flex-1 flex-wrap items-center gap-2 px-2">
      <a class="btn btn-ghost btn-sm" href="/">{ $t`Home` }</a>
      <a class="btn btn-ghost btn-sm" href="/settings">{ $t`Settings` }</a>
      <a class="btn btn-ghost btn-sm" href="/playground">{ $t`Playground` }</a>
    </nav>
    <LanguageSwitcher {locale} />
  </header>

  <main class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
    {@render children?.()}
  </main>
</div>
