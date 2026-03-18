<script lang="ts">
  import { Trans } from "lingui-for-svelte/macro";

  import { initializeI18n } from "../i18n.svelte";

  let {
    locale,
    name,
  }: {
    locale: "en" | "ja";
    name: string;
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  <Trans>
    Say hello to <strong>{name}</strong>.
  </Trans>
</p>
<!-- docs-snippet:end -->
