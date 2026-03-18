<script lang="ts">
  import { SelectOrdinal } from "lingui-for-svelte/macro";

  import { initializeI18n } from "../i18n.svelte";

  let {
    locale,
    place,
  }: {
    locale: "en" | "ja";
    place: number;
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  <SelectOrdinal value={place} one="#st" two="#nd" few="#rd" other="#th" />
</p>
<!-- docs-snippet:end -->
