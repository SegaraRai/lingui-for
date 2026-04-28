<script lang="ts">
  import { setupI18n } from "@lingui/core";
  import { setLinguiContext } from "lingui-for-svelte";

  import { messages as en } from "../i18n/locales/en";

  const i18n = setupI18n({
    locale: "en",
    messages: { en },
  });

  setLinguiContext(i18n);

  let { children } = $props();
</script>

{@render children?.()}
