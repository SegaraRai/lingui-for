<script lang="ts">
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

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Init: Preloaded`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`All locales preloaded at init`}
    </h1>
    <p class="text-base-content/80">
      {$t`This component calls setupI18n with all locale messages upfront. Switching only requires activate() - no load() call.`}
    </p>
    <p class="text-base-content/60 text-sm">
      {$t`This widget has its own i18n context, independent of the app locale.`}
    </p>

    <div class="flex flex-wrap items-center gap-4">
      <button class="btn btn-primary" onclick={toggle} type="button">
        {$t`Toggle locale`}
        <span class="badge badge-neutral ml-1">{locale}</span>
      </button>
      <div class="flex items-center gap-2">
        <button
          class="btn btn-outline btn-sm"
          onclick={() => (count = Math.max(0, count - 1))}
          type="button"
        >
          −
        </button>
        <span class="font-mono text-lg">{count}</span>
        <button
          class="btn btn-outline btn-sm"
          onclick={() => (count += 1)}
          type="button"
        >
          +
        </button>
      </div>
    </div>

    <div class="space-y-2 text-lg">
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
