<script lang="ts">
  import { selectOrdinal } from "lingui-for-svelte/macro";

  import { initializeI18n, type Locale } from "../i18n.svelte";

  let {
    locale,
    place,
  }: {
    locale: Locale;
    place: number;
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  {$selectOrdinal(place, {
    one: "#st",
    two: "#nd",
    few: "#rd",
    other: "#th",
  })}
</p>
<!-- docs-snippet:end -->
