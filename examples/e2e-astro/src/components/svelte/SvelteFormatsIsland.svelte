<script lang="ts">
  import {
    Plural,
    plural,
    Select,
    select,
    SelectOrdinal,
    selectOrdinal,
    t,
  } from "lingui-for-svelte/macro";

  import type { SupportedLocale } from "../../lib/i18n/locale";
  import { useLinguiLocale } from "../../lib/i18n/use-lingui-locale.svelte";

  let { locale }: { locale: SupportedLocale } = $props();

  useLinguiLocale(() => locale);
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body">
    <p class="badge badge-accent badge-outline flex-none">
      {$t`Svelte formats`}
    </p>
    <h2 class="card-title">
      {$t`Svelte runs plural, select, and selectOrdinal macros in component code.`}
    </h2>
    <p class="text-base-content/70">
      <Plural
        value={3}
        one="# Svelte format sample"
        other="# Svelte format samples"
      />
    </p>
    <p class="text-base-content/70">
      <Select
        value="excited"
        _calm="Svelte select says calm."
        _excited="Svelte select says excited."
        other="Svelte select says unknown."
      />
    </p>
    <p class="text-base-content/70">
      <SelectOrdinal
        value={2}
        one="Svelte finished #st."
        two="Svelte finished #nd."
        few="Svelte finished #rd."
        other="Svelte finished #th."
      />
    </p>
    <hr class="divider" />
    <p class="text-base-content/70">
      {$plural(3, {
        one: "# Svelte format sample",
        other: "# Svelte format samples",
      })}
    </p>
    <p class="text-base-content/70">
      {$select("excited", {
        calm: "Svelte select says calm.",
        excited: "Svelte select says excited.",
        other: "Svelte select says unknown.",
      })}
    </p>
    <p class="text-base-content/70">
      {$selectOrdinal(2, {
        one: "Svelte finished #st.",
        two: "Svelte finished #nd.",
        few: "Svelte finished #rd.",
        other: "Svelte finished #th.",
      })}
    </p>
  </div>
</section>
