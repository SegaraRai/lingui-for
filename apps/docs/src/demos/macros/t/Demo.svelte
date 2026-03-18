<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  import { initializeI18n, type Locale } from "../i18n.svelte";

  let {
    locale,
    name,
  }: {
    locale: Locale;
    name: string;
  } = $props();

  initializeI18n(() => locale);
</script>

<!-- docs-snippet:start -->
<p>
  {name ? $t`Hello ${name}` : $t`Hi there!`}
</p>
<!-- docs-snippet:end -->
