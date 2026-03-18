<script lang="ts">
  import { Plural } from "lingui-for-svelte/macro";

  import { initializeI18n } from "../i18n.svelte";

  let {
    count,
    locale,
  }: {
    count: number;
    locale: "en" | "ja";
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  <Plural value={count} one="# file" other="# files" />
</p>
<!-- docs-snippet:end -->
