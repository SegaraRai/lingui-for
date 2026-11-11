<script lang="ts">
  import { style } from "stillwind/svelte";
  import type { Snippet } from "svelte";

  import { t } from "lingui-for-svelte/macro";

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

<div>
  <header
    {...style(
      "navbar sticky top-0 z-20 px-4 bg-base-100/90 border-base-300 border-b shadow-sm backdrop-blur md:px-6",
    )}
  >
    <a {...style("btn btn-ghost px-0 text-lg font-semibold")} href="/">
      lingui-for-svelte
    </a>
    <nav {...style("flex px-2 flex-1 flex-wrap items-center gap-2")}>
      <a {...style("btn btn-ghost btn-sm")} href="/">{$t`Home`}</a>
      <a {...style("btn btn-ghost btn-sm")} href="/settings">{$t`Settings`}</a>
      <a {...style("btn btn-ghost btn-sm")} href="/playground"
        >{$t`Playground`}</a
      >
    </nav>
    <LanguageSwitcher {locale} />
  </header>

  <main
    {...style(
      "flex mx-auto w-full max-w-6xl px-4 py-6 flex-1 flex-col gap-6 md:px-6 md:py-8",
    )}
  >
    {@render children?.()}
  </main>
</div>
