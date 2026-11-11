<script lang="ts">
  import { style } from "stillwind/svelte";
  import { msg, t } from "lingui-for-svelte/macro";
  import { RuntimeTrans } from "lingui-for-svelte/runtime";

  import {
    importedDescriptor,
    importedSecondaryDescriptor,
  } from "../../../lib/playground/imported-descriptors";

  let name = $state("Svelte");
  const localDescriptor = msg`Descriptor created in a route component.`;
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Basic`}
    </p>
    <h1 {...style("font-black text-4xl md:text-5xl")}>
      {$t`Direct macros in Svelte components`}
    </h1>
    <p {...style("text-base-content/80")}>
      {$t`This route keeps the common Lingui flow simple: write messages next to the code that renders them.`}
    </p>

    <label {...style("max-w-sm gap-2")}>
      <span {...style("font-semibold")}>{$t`Name`}</span>
      <input bind:value={name} {...style("input")} />
    </label>

    <div {...style("space-y-3 text-lg")}>
      <p>{$t`Immediate translation in markup.`}</p>
      <p>{$t`Hello ${name} from the basic route.`}</p>
      <p><RuntimeTrans {...localDescriptor} /></p>
      <p>{$t(importedDescriptor)}</p>
      <p>{$t(importedSecondaryDescriptor)}</p>
    </div>
  </div>
</section>
