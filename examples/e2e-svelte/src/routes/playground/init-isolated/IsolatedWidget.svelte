<script lang="ts">
  import { setupI18n } from "@lingui/core";
  import { setLinguiContext } from "lingui-for-svelte";
  import { t } from "lingui-for-svelte/macro";

  import { messages as en } from "$lib/i18n/locales/en";

  // This component has its own i18n context fixed to English,
  // regardless of what locale the parent app is using.
  const i18n = setupI18n({
    locale: "en",
    messages: { en },
  });
  setLinguiContext(i18n);
</script>

<div class="bg-base-200 rounded-box space-y-1 p-4 text-sm">
  <p
    class="text-base-content/60 text-xs font-semibold tracking-widest uppercase"
  >
    {$t`Isolated widget (always English)`}
  </p>
  <p>{$t`This widget has its own context and ignores the app locale.`}</p>
  <p>{$t`Hello from the isolated widget.`}</p>
</div>
