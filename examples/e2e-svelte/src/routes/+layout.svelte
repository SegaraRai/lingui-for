<script lang="ts">
  import LocaleSwitcher from "$lib/components/LocaleSwitcher.svelte";
  import { appTitle, navHome, navPlayground } from "$lib/i18n/messages";
  import {
    appI18n,
    formatDescriptor,
    ensureLocale,
  } from "$lib/i18n/session.svelte";
  import type { SupportedLocale } from "$lib/i18n/session.svelte";
  import type { MessageDescriptor } from "lingui-for-svelte/runtime";
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

  function translate(
    descriptor: MessageDescriptor,
    values?: Record<string, unknown>,
  ): string {
    return formatDescriptor(descriptor, values);
  }

  function withLocale(pathname: string): string {
    const query = new URLSearchParams();
    query.set("lang", currentLocale());
    return `${pathname}?${query.toString()}`;
  }
</script>

<svelte:head>
  <title>{translate(appTitle)}</title>
</svelte:head>

<div class="shell">
  <header class="topbar">
    <a class="brand" href={withLocale("/")}>lingui-for-svelte</a>
    <nav>
      <a href={withLocale("/")}>{translate(navHome)}</a>
      <a href={withLocale("/playground")}>{translate(navPlayground)}</a>
    </nav>
    <LocaleSwitcher locale={currentLocale()} />
  </header>

  <main>
    {@render children?.()}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: "IBM Plex Sans", sans-serif;
    background:
      radial-gradient(
        circle at top,
        rgba(255, 214, 153, 0.85),
        transparent 30%
      ),
      linear-gradient(180deg, #f5efe6 0%, #e6dece 100%);
    color: #201914;
  }

  :global(a) {
    color: inherit;
  }

  .shell {
    min-height: 100vh;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.2rem;
    position: sticky;
    top: 0;
    backdrop-filter: blur(12px);
    background: rgba(245, 239, 230, 0.72);
    border-bottom: 1px solid rgba(32, 25, 20, 0.08);
  }

  .brand {
    font-weight: 700;
    text-decoration: none;
  }

  nav {
    display: flex;
    gap: 1rem;
  }

  nav a {
    text-decoration: none;
    color: #694729;
  }

  main {
    max-width: 72rem;
    margin: 0 auto;
    padding: 2.2rem 1.2rem 3rem;
  }

  @media (max-width: 720px) {
    .topbar {
      flex-wrap: wrap;
    }
  }
</style>
