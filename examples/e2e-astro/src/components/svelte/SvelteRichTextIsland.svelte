<script lang="ts">
  import { Trans } from "lingui-for-svelte/macro";

  import type { SupportedLocale } from "../../lib/i18n/locale";
  import { useLinguiLocale } from "../../lib/i18n/use-lingui-locale.svelte";

  let { locale }: { locale: SupportedLocale } = $props();
  const htmlDigest = "<strong>Locale review digest</strong>";
  const highlightedQueue = ["North", "West", "South"];
  const selectedRegion = $state("Kansai");

  useLinguiLocale(() => locale);
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body">
    <p class="badge badge-accent badge-outline flex-none">
      <Trans>Svelte rich text</Trans>
    </p>
    <h2 class="card-title">
      <Trans>Svelte rich text keeps component placeholders intact.</Trans>
    </h2>
    <p class="text-base-content/70">
      <Trans>
        Svelte keeps the{" "}<a class="link link-primary" href="/settings">
          settings link
        </a>{" "}inside a translated sentence.
      </Trans>
    </p>
    <p class="text-base-content/70">
      <Trans>
        Svelte can preserve{" "}<strong>strong emphasis</strong>{" "}in
        translated output.
      </Trans>
    </p>
    <p class="text-base-content/70">
      <Trans>
        Imported review digest:
        {@html htmlDigest}
      </Trans>
    </p>
    <p class="text-base-content/70">
      <Trans>
        Translation previews can show {@render textSummary()} and
        {@render htmlSummary()} in the same sentence.
      </Trans>
    </p>
    <div class="text-base-content/70">
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
</section>

{#snippet textSummary()}<span>plain text</span>{/snippet}
{#snippet htmlSummary()}<span><em>highlighted markup</em></span>{/snippet}
