<script lang="ts">
  import { ph, t, Trans } from "lingui-for-svelte/macro";

  const subject = "Svelte";
  /* lingui-set context="compat-svelte" comment="Svelte compatibility directive" idPrefix="compat." */
  const directiveMessage = t.eager({
    id: "directive",
    message: `Compatibility directive for ${subject}.`,
  });
  const namedPlaceholder = t.eager`Named compatibility subject: ${ph({ subjectName: subject })}.`;
  /* lingui-reset */

  // lingui-set context="compat-cross-block" comment="Svelte compatibility directive crossing script" idPrefix="compat."
</script>

<h1>{$t`Hello ${subject}`}</h1>
<p>{directiveMessage}</p>
<p>{namedPlaceholder}</p>
<Trans id="cross-block"
  >Compatibility directive inherited from Svelte script.</Trans
>
<!-- lingui-reset -->
<Trans
  >Named compatibility component subject: {ph({ subjectName: subject })}.</Trans
>
<Trans>Build <strong>SvelteKit</strong> compatibility.</Trans>
