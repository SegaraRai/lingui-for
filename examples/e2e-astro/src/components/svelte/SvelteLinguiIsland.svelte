<script lang="ts">
  import { plural, t, Trans } from "lingui-for-svelte/macro";

  import type { SupportedLocale } from "../../lib/i18n/locale";
  import { getLocaleLabel } from "../../lib/i18n/runtime";
  import { useLinguiLocale } from "../../lib/i18n/use-lingui-locale.svelte";

  let { locale }: { locale: SupportedLocale } = $props();

  useLinguiLocale(() => locale);

  const localeLabel = $derived(getLocaleLabel(locale));
  let count = $state(2);
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body">
    <p class="badge badge-accent badge-outline flex-none">
      {$t`Svelte island`}
    </p>
    <h2 class="card-title">{$t`Svelte macros keep working inside Astro.`}</h2>
    <p class="text-base-content/70">
      <Trans>
        The active <strong>Lingui context</strong> is created inside the Svelte island.
      </Trans>
    </p>
    <p class="text-base-content/70">
      {$plural(count, {
        one: "# localized Svelte example",
        other: "# localized Svelte examples",
      })}
    </p>
    <p class="badge badge-secondary badge-lg flex-none">
      {$t`Svelte sees locale ${localeLabel}.`}
    </p>
  </div>
</section>
