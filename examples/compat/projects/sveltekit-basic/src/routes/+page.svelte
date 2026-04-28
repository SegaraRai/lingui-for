<script lang="ts">
  import { t, Trans } from "lingui-for-svelte/macro";

  const subject = "Svelte";
</script>

<h1>{$t`Hello ${subject}`}</h1>
<Trans>Build <strong>SvelteKit</strong> compatibility.</Trans>
