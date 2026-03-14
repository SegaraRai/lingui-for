<script lang="ts">
  import { page } from "$app/state";
  import { t } from "lingui-for-svelte/macro";
  import type { MessageDescriptor } from "lingui-for-svelte/runtime";

  let {
    href,
    eyebrow,
    title,
    body,
  }: {
    href: string;
    eyebrow: MessageDescriptor;
    title: MessageDescriptor;
    body: MessageDescriptor;
  } = $props();

  function withCurrentLocale(pathname: string): string {
    const query = new URLSearchParams(page.url.searchParams);
    return query.size > 0 ? `${pathname}?${query.toString()}` : pathname;
  }
</script>

<a class="card" href={withCurrentLocale(href)}>
  <p class="eyebrow">{$t(eyebrow)}</p>
  <h2>{$t(title)}</h2>
  <p class="body">{$t(body)}</p>
</a>

<style>
  .card {
    display: block;
    padding: 1.2rem;
    border-radius: 1.2rem;
    text-decoration: none;
    color: inherit;
    background: rgba(255, 252, 247, 0.85);
    border: 1px solid rgba(32, 25, 20, 0.1);
    box-shadow: 0 16px 40px rgba(56, 41, 28, 0.08);
    transition:
      transform 160ms ease,
      box-shadow 160ms ease;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 50px rgba(56, 41, 28, 0.14);
  }

  .eyebrow {
    margin: 0 0 0.45rem;
    font-size: 0.82rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8a5d2f;
  }

  h2 {
    margin: 0;
    font-size: 1.3rem;
    line-height: 1.1;
  }

  .body {
    margin: 0.7rem 0 0;
    color: #5a4634;
  }
</style>
