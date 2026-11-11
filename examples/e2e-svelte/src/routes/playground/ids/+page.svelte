<script lang="ts">
  import { style } from "stillwind/svelte";
  import { msg, t, Trans } from "lingui-for-svelte/macro";
  import { RuntimeTrans } from "lingui-for-svelte/runtime";

  const explicitDescriptor = msg({
    id: "playground.ids.descriptor",
    message: "Explicit id from a plain descriptor.",
  });
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Explicit ids`}
    </p>
    <h1 {...style("font-black text-4xl md:text-5xl")}>
      {$t`Targeted id, comment, and context coverage`}
    </h1>
    <p {...style("text-base-content/80")}>
      {$t`The main app avoids explicit ids by default. This route keeps those variants available for extractor and compile tests.`}
    </p>

    <div {...style("space-y-3 text-lg")}>
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
