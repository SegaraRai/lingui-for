<script lang="ts">
  import { t } from "lingui-svelte/macro";
  import {
    decrementPlayground,
    formatDescriptor,
    getPlaygroundGreeting,
    getPlaygroundSummary,
    incrementPlayground,
    playgroundState,
    stateTaggedDescriptor,
    setPlaygroundName,
  } from "$lib/i18n/session.svelte";

  let { data } = $props();
  const taggedScriptCopy = $derived(
    $t`Tagged template literal from route script.`,
  );
</script>

<section class="panel">
  <p class="eyebrow">{formatDescriptor(data.copy.eyebrow)}</p>
  <h1>{formatDescriptor(data.copy.title)}</h1>
  <p class="body">{formatDescriptor(data.copy.body)}</p>

  <div class="fields">
    <label>
      <span>{formatDescriptor(data.copy.fieldName)}</span>
      <input
        bind:value={playgroundState.name}
        oninput={(event) =>
          setPlaygroundName((event.currentTarget as HTMLInputElement).value)}
      />
    </label>

    <label>
      <span>{formatDescriptor(data.copy.fieldCount)}</span>
      <input bind:value={playgroundState.count} min="0" type="number" />
    </label>
  </div>

  <div class="actions">
    <button onclick={decrementPlayground} type="button">
      {formatDescriptor(data.copy.decrement)}
    </button>
    <button onclick={incrementPlayground} type="button">
      {formatDescriptor(data.copy.increment)}
    </button>
  </div>

  <p class="summary">{getPlaygroundSummary()}</p>
  <p class="summary">{getPlaygroundGreeting()}</p>
  <p class="summary">{taggedScriptCopy}</p>
  <p class="summary">{$t`Tagged template literal from markup expression.`}</p>
  <p class="helper">{$t(data.copy.rawTagged)}</p>
  <p class="helper">{$t(stateTaggedDescriptor)}</p>
  <p class="helper">{formatDescriptor(data.copy.helper)}</p>
</section>

<style>
  .panel {
    padding: 1rem 0 3rem;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #8a5d2f;
  }

  h1 {
    margin: 0.5rem 0 1rem;
    font-size: clamp(2.6rem, 7vw, 4.6rem);
    line-height: 0.96;
  }

  .body,
  .helper {
    color: #5a4634;
  }

  .fields {
    display: grid;
    gap: 1rem;
    margin: 1.5rem 0;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }

  label span {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  input {
    width: 100%;
    padding: 0.8rem 0.95rem;
    border-radius: 0.9rem;
    border: 1px solid rgba(32, 25, 20, 0.14);
    background: rgba(255, 252, 247, 0.82);
    font: inherit;
  }

  .actions {
    display: flex;
    gap: 0.8rem;
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 0.75rem 1rem;
    background: #201914;
    color: #fff6ec;
    font: inherit;
    cursor: pointer;
  }

  .summary {
    margin-top: 1.3rem;
    font-size: 1.15rem;
    font-weight: 600;
  }
</style>
