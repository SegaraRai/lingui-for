<script lang="ts">
  import { style } from "stillwind/svelte";
  import { setupI18n } from "@lingui/core";
  import { setLinguiContext } from "lingui-for-svelte";
  import { plural, t } from "lingui-for-svelte/macro";

  import { catalogs } from "$lib/i18n/catalogs";
  import type { SupportedLocale } from "$lib/i18n/locale";

  // Empty init - each locale is loaded on demand via loadAndActivate.
  const i18n = setupI18n();
  i18n.loadAndActivate({ locale: "en", messages: catalogs.en });
  setLinguiContext(i18n);

  let locale = $state<SupportedLocale>("en");
  let count = $state(3);

  function toggle() {
    const next: SupportedLocale = locale === "en" ? "ja" : "en";
    locale = next;
    i18n.loadAndActivate({ locale: next, messages: catalogs[next] });
  }
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Init: Lazy`}
    </p>
    <h1 {...style("font-black text-4xl md:text-5xl")}>
      {$t`Locale loaded on demand`}
    </h1>
    <p {...style("text-base-content/80")}>
      {$t`This component starts with an empty setupI18n() and calls loadAndActivate on each switch. Only one locale is in memory at a time.`}
    </p>
    <p {...style("text-base-content/60 text-sm")}>
      {$t`This widget has its own i18n context, independent of the app locale.`}
    </p>

    <div {...style("flex flex-wrap items-center gap-4")}>
      <button {...style("btn btn-primary")} onclick={toggle} type="button">
        {$t`Toggle locale`}
        <span {...style("badge badge-neutral ml-1")}>{locale}</span>
      </button>
      <div {...style("flex items-center gap-2")}>
        <button
          {...style("btn btn-outline btn-sm")}
          onclick={() => (count = Math.max(0, count - 1))}
          type="button"
        >
          −
        </button>
        <span {...style("font-mono text-lg")}>{count}</span>
        <button
          {...style("btn btn-outline btn-sm")}
          onclick={() => (count += 1)}
          type="button"
        >
          +
        </button>
      </div>
    </div>

    <div {...style("space-y-2 text-lg")}>
      <p>{$t`Hello from the lazy init pattern.`}</p>
      <p>
        {$plural(count, {
          one: "# item in the list.",
          other: "# items in the list.",
        })}
      </p>
    </div>
  </div>
</section>
