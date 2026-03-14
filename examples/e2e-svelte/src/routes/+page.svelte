<script lang="ts">
  import { page } from "$app/state";
  import { t, Trans } from "lingui-for-svelte/macro";
  import RouteCard from "$lib/components/RouteCard.svelte";

  let { data } = $props();

  function withCurrentLocale(pathname: string): string {
    const query = new URLSearchParams(page.url.searchParams);
    return query.size > 0 ? `${pathname}?${query.toString()}` : pathname;
  }
</script>

<section class="hero">
  <p class="eyebrow">{$t(data.hero.eyebrow)}</p>
  <h1>{$t(data.hero.title)}</h1>
  <p class="body">{$t(data.hero.body)}</p>
  <p class="body rich-copy">
    <Trans id="kit.home.rich-copy">
      Browse the <a href={withCurrentLocale("/playground")}>playground</a> to
      see <strong>embedded elements</strong> and locale-aware runtime updates.
    </Trans>
  </p>
</section>

<section class="grid">
  {#each data.cards as card}
    <RouteCard {...card} />
  {/each}
</section>

<style>
  .hero {
    padding: 1rem 0 2rem;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #8a5d2f;
  }

  h1 {
    max-width: 12ch;
    margin: 0.5rem 0 1rem;
    font-size: clamp(3rem, 9vw, 5.5rem);
    line-height: 0.95;
  }

  .body {
    max-width: 54rem;
    font-size: 1.15rem;
    color: #5a4634;
  }

  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }
</style>
