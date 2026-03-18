<script lang="ts">
  import { select } from "lingui-for-svelte/macro";

  import { initializeI18n, type Locale } from "../i18n.svelte";

  let {
    locale,
    tone,
  }: {
    locale: Locale;
    tone: "casual" | "formal" | "other";
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  {$select(tone, {
    formal: "Welcome",
    casual: "Hi",
    other: "Hello",
  })}
</p>
<!-- docs-snippet:end -->
