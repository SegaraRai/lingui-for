<script lang="ts">
  import { Select } from "lingui-for-svelte/macro";

  import { initializeI18n } from "../i18n.svelte";

  let {
    locale,
    tone,
  }: {
    locale: "en" | "ja";
    tone: "casual" | "formal" | "other";
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  <Select value={tone} _formal="Welcome" _casual="Hi" other="Hello" />
</p>
<!-- docs-snippet:end -->
