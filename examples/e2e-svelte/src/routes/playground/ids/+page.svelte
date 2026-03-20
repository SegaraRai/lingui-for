<script lang="ts">
  import { msg, t, Trans } from "lingui-for-svelte/macro";
  import { RuntimeTrans } from "lingui-for-svelte/runtime";

  const explicitDescriptor = msg({
    id: "playground.ids.descriptor",
    message: "Explicit id from a plain descriptor.",
  });
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
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
        <Trans
          id="playground.ids.trans"
          comment="Used by the ids playground route"
        >
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
        <RuntimeTrans {...explicitDescriptor} />
      </p>
    </div>
  </div>
</section>
