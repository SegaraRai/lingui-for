<script lang="ts">
  import { style } from "stillwind/svelte";
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

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body")}>
    <p {...style("badge badge-outline badge-accent flex-none")}>
      {$t`Svelte formats`}
    </p>
    <h2 {...style("card-title")}>
      {$t`Svelte runs plural, select, and selectOrdinal macros in component code.`}
    </h2>
    <p {...style("text-base-content/70")}>
      <Plural
        value={3}
        one="# Svelte format sample"
        other="# Svelte format samples"
      />
    </p>
    <p {...style("text-base-content/70")}>
      <Select
        value="excited"
        _calm="Svelte select says calm."
        _excited="Svelte select says excited."
        other="Svelte select says unknown."
      />
    </p>
    <p {...style("text-base-content/70")}>
      <SelectOrdinal
        value={2}
        one="Svelte finished #st."
        two="Svelte finished #nd."
        few="Svelte finished #rd."
        other="Svelte finished #th."
      />
    </p>
    <hr {...style("divider")} />
    <p {...style("text-base-content/70")}>
      {$plural(3, {
        one: "# Svelte format sample",
        other: "# Svelte format samples",
      })}
    </p>
    <p {...style("text-base-content/70")}>
      {$select("excited", {
        calm: "Svelte select says calm.",
        excited: "Svelte select says excited.",
        other: "Svelte select says unknown.",
      })}
    </p>
    <p {...style("text-base-content/70")}>
      {$selectOrdinal(2, {
        one: "Svelte finished #st.",
        two: "Svelte finished #nd.",
        few: "Svelte finished #rd.",
        other: "Svelte finished #th.",
      })}
    </p>
  </div>
</section>
