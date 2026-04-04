import RuntimeTransComponent from "./components/RuntimeTrans.astro";

export type { TransRenderNode } from "./components/types.ts";
export {
  createFrontmatterI18n,
  getLinguiContext,
  LINGUI_ASTRO_CONTEXT,
  setLinguiContext,
  type LinguiContext,
} from "./core/context.ts";

/**
 * Props accepted by the runtime `<RuntimeTrans>` component.
 *
 * This component is the low-level target produced by macro compilation. Applications should prefer
 * authoring with `lingui-for-astro/macro` and let the compiler emit `RuntimeTrans` automatically.
 */
interface RuntimeTransProps {
  /**
   * Explicit message id to translate.
   */
  id: string;
  /**
   * Default-message string produced by macro lowering.
   */
  message?: string | undefined;
  /**
   * Runtime interpolation values merged into the final descriptor.
   */
  values?: Readonly<Record<string, unknown>> | undefined;
  /**
   * Rich-text placeholder names used by the translated message.
   */
  placeholders?: readonly string[] | undefined;
}

/**
 * Low-level runtime translation component used by compiled Astro output.
 *
 * Most applications should not render this directly. Prefer the macro authoring API and treat
 * `RuntimeTrans` as an implementation detail of the compiled output.
 */
export const RuntimeTrans = RuntimeTransComponent as (
  props: RuntimeTransProps,
) => unknown;
