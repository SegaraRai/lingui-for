<script lang="ts">
  import { RuntimeTrans } from "lingui-for-svelte";
  import { msg, t } from "lingui-for-svelte/macro";

  import { plainModuleDescriptor } from "$lib/playground/basic";

  let name = $state("Svelte");
  const localDescriptor = msg`Descriptor created in a route component.`;
</script>

<section class="card border border-base-300 bg-base-100 shadow-lg">
  <div class="card-body gap-5">
    <p class="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
      {$t`Basic`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`Direct macros in components and plain modules`}
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
      <p><RuntimeTrans message={localDescriptor} /></p>
      <p><RuntimeTrans message={plainModuleDescriptor} /></p>
    </div>
  </div>
</section>
