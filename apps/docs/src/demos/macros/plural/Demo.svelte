<script lang="ts">
  import { plural } from "lingui-for-svelte/macro";

  import { initializeI18n, type Locale } from "../i18n.svelte";

  let {
    count,
    locale,
  }: {
    count: number;
    locale: Locale;
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  {$plural(count, {
    one: "# item",
    other: "# items",
  })}
</p>
<!-- docs-snippet:end -->
