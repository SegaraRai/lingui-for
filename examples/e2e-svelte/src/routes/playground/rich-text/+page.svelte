<script lang="ts">
  import { t, Trans } from "lingui-for-svelte/macro";

  import InlineBadge from "$lib/playground/InlineBadge.svelte";

  const htmlDigest = "<strong>Locale review digest</strong>";
  const highlightedQueue = ["North", "West", "South"];
  let selectedRegion = $state("Kansai");
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Rich text`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`Embedded elements and components inside Trans`}
    </h1>
    <p class="text-base-content/80">
      {$t`This route focuses on translated markup with both native elements and Svelte components.`}
    </p>

    <div class="space-y-4 text-lg">
      <p>
        <Trans>
          Read the <a class="link link-primary" href="/settings"
            >settings page</a
          >
          and look for the{" "}
          <InlineBadge tone="warm">cookie-backed locale</InlineBadge> behavior.
        </Trans>
      </p>
      <p>
        <Trans>
          Rich text can keep <strong>semantic emphasis</strong> while still using
          Lingui's message extraction flow.
        </Trans>
      </p>
      <p>
        <Trans>
          Imported review digest:
          {@html htmlDigest}
        </Trans>
      </p>
      <p>
        <Trans>
          Translation previews can show {@render textSummary()} and
          {@render htmlSummary()} in the same sentence.
        </Trans>
      </p>
      <div>
        <Trans>
          <p>The current locale review can summarize nested details such as</p>
          <ul>
            <li>
              <em>{highlightedQueue.length} highlighted queue items</em>, plus
            </li>
            <li>the selected region {selectedRegion}.</li>
          </ul>
        </Trans>
      </div>
    </div>
  </div>
</section>

{#snippet textSummary()}<span>plain text</span>{/snippet}
{#snippet htmlSummary()}<span><em>highlighted markup</em></span>{/snippet}
