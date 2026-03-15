<script lang="ts">
  import { RuntimeTrans } from "lingui-for-svelte";
  import { t, msg, Trans } from "lingui-for-svelte/macro";

  const explicitDescriptor = msg({
    id: "playground.ids.descriptor",
    message: "Explicit id from a plain descriptor.",
  });
</script>

<section class="card border border-base-300 bg-base-100 shadow-lg">
  <div class="card-body gap-5">
    <p class="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
      {$t`Explicit ids`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`Targeted id, comment, and context coverage`}
    </h1>
    <p class="text-base-content/80">
      {$t`The main app avoids explicit ids by default. This route keeps those variants available for extractor and compile tests.`}
    </p>

    <div class="space-y-3 text-lg">
      <p>
        <Trans id="playground.ids.trans" comment="Used by the ids playground route">
          Explicit id from a Trans component.
        </Trans>
      </p>
      <p>
        {$t({
          id: "playground.ids.call",
          message: "Explicit id from t({...}).",
        })}
      </p>
      <p>
        <RuntimeTrans message={explicitDescriptor} />
      </p>
    </div>
  </div>
</section>
