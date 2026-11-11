<script lang="ts">
  import { style } from "stillwind/svelte";
  import { plural, t, Trans } from "lingui-for-svelte/macro";

  import type { SupportedLocale } from "../../lib/i18n/locale";
  import { getLocaleLabel } from "../../lib/i18n/runtime";
  import {
    sharedImportedDescriptor,
    sharedImportedDetailDescriptor,
  } from "../../lib/i18n/shared-descriptors";
  import { useLinguiLocale } from "../../lib/i18n/use-lingui-locale.svelte";

  let { locale }: { locale: SupportedLocale } = $props();

  useLinguiLocale(() => locale);

  const localeLabel = $derived(getLocaleLabel(locale));
  let count = $state(2);
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body")}>
    <p {...style("badge badge-outline badge-accent flex-none")}>
      {$t`Svelte island`}
    </p>
    <h2 {...style("card-title")}>
      {$t`Svelte macros keep working inside Astro.`}
    </h2>
    <p {...style("text-base-content/70")}>
      <Trans>
        The active{" "}<strong>Lingui context</strong>{" "}is created inside the
        Svelte island.
      </Trans>
    </p>
    <p {...style("text-base-content/70")}>
      {$plural(count, {
        one: "# localized Svelte example",
        other: "# localized Svelte examples",
      })}
    </p>
    <p {...style("text-base-content/70")}>{$t(sharedImportedDescriptor)}</p>
    <p {...style("text-base-content/70")}>
      {t.eager(sharedImportedDetailDescriptor)}
    </p>
    <p {...style("badge badge-secondary badge-lg flex-none")}>
      {$t`Svelte sees locale ${localeLabel}.`}
    </p>
  </div>
</section>
