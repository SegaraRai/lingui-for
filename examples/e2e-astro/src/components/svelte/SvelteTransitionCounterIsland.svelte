<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  import type { SupportedLocale } from "../../lib/i18n/locale";
  import { getLocaleLabel } from "../../lib/i18n/runtime";
  import { useLinguiLocale } from "../../lib/i18n/use-lingui-locale.svelte";

  let {
    locale,
    mode,
    pageLabel,
  }: {
    locale: SupportedLocale;
    mode: "volatile" | "persisted" | "persisted-props";
    pageLabel: string;
  } = $props();

  useLinguiLocale(() => locale);

  const localeLabel = $derived(getLocaleLabel(locale));
  let count = $state(0);
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-4">
    <p class="badge badge-accent badge-outline flex-none">
      {{
        volatile: $t`Volatile Svelte island`,
        persisted: $t`Persisted Svelte island`,
        "persisted-props": $t`Persisted-props Svelte island`,
      }[mode]}
    </p>
    <p class="text-base-content/70">
      {{
        volatile: $t`This Svelte island remounts whenever the route or locale changes.`,
        persisted: $t`This Svelte island uses transition:persist, so its counter survives while locale and page props still update.`,
        "persisted-props": $t`This Svelte island uses transition:persist and transition:persist-props, so its counter survives but locale and page props stay frozen.`,
      }[mode]}
    </p>
    <p class="text-base-content/70">
      {$t`Svelte props say ${pageLabel} in ${localeLabel}.`}
    </p>
    <div class="flex items-center gap-3">
      <button class="btn btn-secondary btn-sm" onclick={() => (count += 1)}>
        {$t`Increment`}
      </button>
      <p class="badge badge-secondary badge-lg flex-none">
        {$t`${count} Svelte clicks`}
      </p>
    </div>
  </div>
</section>
