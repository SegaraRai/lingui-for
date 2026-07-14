<script lang="ts">
  import { ph, t, Trans } from "lingui-for-svelte/macro";

  import { initializeI18n, type Locale } from "../i18n.svelte";

  let {
    locale,
    name,
  }: {
    locale: Locale;
    name: string;
  } = $props();

  initializeI18n(() => locale);

  let user = $derived({
    profile: {
      displayName: name.trim() || "friend",
    },
  });
</script>

<!-- docs-snippet:start -->
<p>{$t`Hello ${ph({ username: user.profile.displayName })}`}</p>
<p><Trans>Welcome {ph({ username: user.profile.displayName })}!</Trans></p>
<!-- docs-snippet:end -->
