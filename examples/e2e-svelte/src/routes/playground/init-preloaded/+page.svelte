<script lang="ts">
  import { style } from "stillwind/svelte";
  import { setupI18n } from "@lingui/core";
  import { setLinguiContext } from "lingui-for-svelte";
  import { plural, t } from "lingui-for-svelte/macro";

  import { messages as en } from "$lib/i18n/locales/en";
  import { messages as ja } from "$lib/i18n/locales/ja";

  // All locales loaded upfront. activate() is enough to switch - no load() call needed.
  const i18n = setupI18n({
    locale: "en",
    messages: { en, ja },
  });
  setLinguiContext(i18n);

  let locale = $state<"en" | "ja">("en");
  let count = $state(3);

  function toggle() {
    locale = locale === "en" ? "ja" : "en";
    i18n.activate(locale);
  }
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Init: Preloaded`}
    </p>
    <h1 {...style("font-black text-4xl md:text-5xl")}>
      {$t`All locales preloaded at init`}
    </h1>
    <p {...style("text-base-content/80")}>
      {$t`This component calls setupI18n with all locale messages upfront. Switching only requires activate() - no load() call.`}
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
      <p>{$t`Hello from the preloaded init pattern.`}</p>
      <p>
        {$plural(count, {
          one: "# item in the list.",
          other: "# items in the list.",
        })}
      </p>
    </div>
  </div>
</section>
