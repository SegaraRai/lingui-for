<script lang="ts">
  import type { MessageDescriptor } from "@lingui/core";

  import { getI18nStore } from "./index";

  let {
    message,
    values = {},
  }: {
    message: MessageDescriptor;
    values?: Record<string, unknown>;
  } = $props();

  const lingui = getI18nStore();

  const translated = $derived(
    $lingui._({
      ...message,
      values: {
        ...(message.values ?? {}),
        ...values,
      },
    }),
  );
</script>

{translated}
