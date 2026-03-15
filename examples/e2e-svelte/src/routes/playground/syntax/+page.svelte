<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  let syntaxState = $state({
    query: "",
    mode: "idle" as "idle" | "active",
    revision: 1,
    items: ["placeholder", "snippet", "keyed block"],
  });

  function toggleMode(): void {
    syntaxState.mode = syntaxState.mode === "idle" ? "active" : "idle";
  }

  function bumpRevision(): void {
    syntaxState.revision += 1;
  }
</script>

{#snippet syntaxChip(text: string)}
  <span class="badge badge-outline" title={$t`Snippet badge`}>
    {$t`Snippet item: ${text}`}
  </span>
{/snippet}

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Syntax`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`$t across Svelte syntax positions`}
    </h1>
    <p class="text-base-content/80">
      {$t`This route exercises @const, attributes, snippets, keyed blocks, and other expression sites in Svelte.`}
    </p>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <label class="form-control gap-2">
        <span class="label-text font-semibold">{$t`Search examples`}</span>
        <input
          bind:value={syntaxState.query}
          class="input input-bordered"
          placeholder={$t`Type to filter syntax examples`}
          title={$t`This placeholder comes from $t inside an attribute`}
          aria-label={$t`Filter playground syntax examples`}
        />
      </label>

      <div class="flex flex-wrap items-end gap-3">
        <button
          class="btn btn-outline btn-primary"
          onclick={toggleMode}
          title={$t`Toggle the status branch`}
          type="button"
        >
          {$t`Toggle mode`}
        </button>
        <button
          class="btn btn-secondary"
          onclick={bumpRevision}
          title={$t`Force a keyed subtree refresh`}
          type="button"
        >
          {$t`Bump revision`}
        </button>
      </div>
    </div>

    {#if true}
      {@const statusSummary =
        syntaxState.mode === "idle"
          ? $t`Status summary: idle`
          : $t`Status summary: active`}

      <div class="space-y-3 text-lg">
        <p>{statusSummary}</p>

        {#if syntaxState.mode === "idle"}
          <p>{$t`The syntax playground is idle.`}</p>
        {:else}
          <p>{$t`The syntax playground is active.`}</p>
        {/if}

        {#if syntaxState.query}
          <p>{$t`Filter text: ${syntaxState.query}`}</p>
        {:else}
          <p>{$t`Filter text: (empty)`}</p>
        {/if}
      </div>
    {/if}

    <div class="space-y-3">
      {#each syntaxState.items as item, index (item)}
        {#if !syntaxState.query || item.includes(syntaxState.query)}
          {@const rowSummary = $t`Row ${index + 1}: ${item}`}
          <div
            class="rounded-box border-base-300 bg-base-200/50 flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
            title={rowSummary}
            aria-label={rowSummary}
          >
            <span class="font-medium">{rowSummary}</span>
            {@render syntaxChip(item)}
          </div>
        {/if}
      {/each}
    </div>

    {#key syntaxState.revision}
      <div class="alert alert-info" aria-label={$t`Keyed block example`}>
        <span>{$t`Keyed subtree revision ${syntaxState.revision}`}</span>
      </div>
    {/key}
  </div>
</section>
