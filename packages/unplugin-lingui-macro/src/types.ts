import type { LinguiConfig } from "@lingui/conf";
import type {
  LinguiMacroOptions,
  TransformOptions,
} from "@lingui/native-tools";

/**
 * Options for the native macro transform provided by `@lingui/native-tools`.
 */
export type LinguiNativeMacroTransformOptions = {
  /**
   * Macro option overrides. Values not set here are derived from the Lingui config.
   */
  macro?: Partial<LinguiMacroOptions> | undefined;
  /**
   * SWC parser options. By default the syntax is inferred from the file extension.
   */
  parser?: TransformOptions["parser"] | undefined;
};

export type LinguiMacroPluginOptions = {
  config?: LinguiConfig | string | URL | undefined;
  /**
   * Transform macros with the native (Rust + SWC) transformer from `@lingui/native-tools`
   * instead of Babel. Requires `@lingui/native-tools` to be installed.
   *
   * Pass `true` to enable it with default options, or an object to configure it.
   *
   * @default false
   */
  native?: boolean | LinguiNativeMacroTransformOptions | undefined;
};
