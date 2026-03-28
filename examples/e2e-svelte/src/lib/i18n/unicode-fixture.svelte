<script lang="ts">
  import { untrack } from "svelte";

  import { t, Trans } from "lingui-for-svelte/macro";

  const name = $state("世界");
  const direct = t.eager`テンプレートこんにちは😀 ${untrack(() => name)}`;
</script>

<p>{direct}</p>
<section>
  前置き🎌
  <Trans>ようこそ <strong>{name}</strong> さん🚀</Trans>
  後置き🍣
</section>
