<script lang="ts">
  import RouteCard from "$lib/components/RouteCard.svelte";
  import { formatDescriptor } from "$lib/i18n/session.svelte";

  let { data } = $props();
</script>

<section class="hero">
  <p class="eyebrow">{formatDescriptor(data.hero.eyebrow)}</p>
  <h1>{formatDescriptor(data.hero.title)}</h1>
  <p class="body">{formatDescriptor(data.hero.body)}</p>
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
