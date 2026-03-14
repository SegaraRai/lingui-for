<script lang="ts">
  import type { MessageDescriptor } from "@lingui/core";

  import { getLinguiContext } from "./index";

  let {
    message,
    values = {},
  }: {
    message: MessageDescriptor;
    values?: Record<string, unknown>;
  } = $props();

  const { _ } = getLinguiContext();

  const translated = $derived(
    $_({
      ...message,
      values: {
        ...(message.values ?? {}),
        ...values,
      },
    }),
  );
</script>

{translated}
