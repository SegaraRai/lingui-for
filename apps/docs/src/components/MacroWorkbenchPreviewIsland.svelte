<script lang="ts">
  import { onMount, untrack } from "svelte";

  import type { MacroWorkbenchScalar } from "../lib/macro-workbench/spec.ts";

  type WorkbenchUpdateDetail = {
    values: Record<string, MacroWorkbenchScalar>;
    workbenchId: string;
  };

  let {
    componentModule,
    initialValues,
    workbenchId,
  }: {
    componentModule: string;
    initialValues: Record<string, MacroWorkbenchScalar>;
    workbenchId: string;
  } = $props();

  const previewModules = import.meta.glob("../demos/**/*.svelte", {
    eager: true,
  });

  const previewModule = $derived(
    previewModules[componentModule] as { default: any } | undefined,
  );
  const PreviewComponent = $derived(previewModule?.default);

  let values = $state<Record<string, MacroWorkbenchScalar>>(
    untrack(() => ({
      ...initialValues,
    })),
  );

  onMount(() => {
    const handleUpdate = (event: Event): void => {
      const customEvent = event as CustomEvent<WorkbenchUpdateDetail>;

      if (customEvent.detail.workbenchId !== workbenchId) {
        return;
      }

      values = {
        ...values,
        ...customEvent.detail.values,
      };
    };

    window.addEventListener("macro-workbench:update", handleUpdate);

    return () => {
      window.removeEventListener("macro-workbench:update", handleUpdate);
    };
  });
</script>

{#if PreviewComponent}
  <PreviewComponent {...values} />
{:else}
  <div class="text-sm text-(--demo-control-text)">
    Preview component could not be resolved.
  </div>
{/if}
