<script lang="ts">
  import { RuntimeTrans } from "lingui-for-svelte";
  import { msg, t } from "lingui-for-svelte/macro";

  import {
    importedDescriptor,
    importedSecondaryDescriptor,
  } from "../../../lib/playground/imported-descriptors";

  let name = $state("Svelte");
  const localDescriptor = msg`Descriptor created in a route component.`;
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Basic`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`Direct macros in Svelte components`}
    </h1>
    <p class="text-base-content/80">
      {$t`This route keeps the common Lingui flow simple: write messages next to the code that renders them.`}
    </p>

    <label class="form-control max-w-sm gap-2">
      <span class="label-text font-semibold">{$t`Name`}</span>
      <input bind:value={name} class="input input-bordered" />
    </label>

    <div class="space-y-3 text-lg">
      <p>{$t`Immediate translation in markup.`}</p>
      <p>{$t`Hello ${name} from the basic route.`}</p>
      <p><RuntimeTrans descriptor={localDescriptor} /></p>
      <p>{$t(importedDescriptor)}</p>
      <p>{t(importedSecondaryDescriptor)}</p>
    </div>
  </div>
</section>
