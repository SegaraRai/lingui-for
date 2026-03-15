<script lang="ts">
  import { t, Trans } from "lingui-for-svelte/macro";

  import InlineBadge from "$lib/playground/InlineBadge.svelte";
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
    </div>
  </div>
</section>
