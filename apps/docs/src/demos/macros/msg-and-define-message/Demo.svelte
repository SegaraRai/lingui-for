<script lang="ts">
  import { defineMessage, msg, t } from "lingui-for-svelte/macro";
  /* docs-cut:start */
  import { initializeI18n } from "../i18n.svelte";

  let {
    locale,
    name,
  }: {
    locale: "en" | "ja";
    name: string;
  } = $props();

  initializeI18n(() => locale);
  /* docs-cut:end */

  const submitLabel = defineMessage({
    id: "form.submit",
    message: "Submit",
  });
  let welcome = $derived(msg`Welcome back, ${name}`);
</script>

<p>
  {$t(welcome)}
</p>

<button type="button">
  {$t(submitLabel)}
</button>
