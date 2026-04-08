/**
 * Public module specifier for the user-facing macro entry.
 *
 * This is used when:
 * - detecting whether a JS/TS file appears to import lingui-for-svelte macros
 * - collecting macro bindings from import declarations
 * - synthesizing temporary imports while probing isolated expressions
 *
 * This is a fixed package export path, not a generated value.
 */
export const PACKAGE_MACRO = "lingui-for-svelte/macro";

/**
 * Public module specifier for the runtime entry used by transformed code.
 *
 * This is used when:
 * - injecting imports into transformed `.svelte` files
 * - configuring Lingui runtime targets for component-style macros
 * - rewriting runtime `i18n` access during postprocessing
 *
 * This is a fixed package export path, not a generated value.
 */
export const PACKAGE_RUNTIME = "lingui-for-svelte/runtime";

/**
 * Temporary wrapper function name inserted around reactive string macros like `$t(...)`.
 *
 * This is only an internal Babel-phase marker used in macro preprocessing/postprocessing
 * so reactive calls can survive the Lingui transform and then be rewritten into the
 * correct runtime form.
 *
 * This value is fixed while the transform runs, but it is an internal implementation
 * detail and is not intended to remain in final emitted code.
 */
export const REACTIVE_TRANSLATION_WRAPPER =
  "__lingui_for_svelte_reactive_translation__";

/**
 * Temporary wrapper function name inserted around explicit eager translations in Rust-managed
 * compile synthetic code so the postprocess pass can restore the final runtime form.
 */
export const EAGER_TRANSLATION_WRAPPER =
  "__lingui_for_svelte_eager_translation__";

/**
 * Default local binding name for the object returned by `getLinguiContext()`.
 *
 * This is used when the Svelte transform injects hidden runtime bindings into a component
 * instance script.
 *
 * This is only a default candidate. The actual emitted identifier may vary because it is
 * passed through the unique-name allocator to avoid collisions with user code.
 */
export const RUNTIME_BINDING_CONTEXT = "__l4s_ctx";

/**
 * Default local binding name for a getter that resolves the current `i18n` instance.
 *
 * This is used in transformed `.svelte` instance scripts when explicit eager translations need
 * access to `i18n._(...)` without eagerly reading Svelte context.
 *
 * This is only a default candidate. The emitted identifier may be renamed to avoid
 * collisions.
 */
export const RUNTIME_BINDING_GET_I18N = "__l4s_getI18n";

/**
 * Default local binding name for the reactive translator taken from Lingui context.
 *
 * This is used in transformed `.svelte` files for `$t(...)`, `$plural(...)`, and related
 * reactive string macros.
 *
 * This is only a default candidate. The emitted identifier may be renamed to avoid
 * collisions with user-defined bindings.
 */
export const RUNTIME_BINDING_TRANSLATE = "__l4s_translate";

/**
 * Default local component binding name for the runtime `RuntimeTrans` component.
 *
 * This is used when component macros are lowered into runtime component calls inside a
 * transformed `.svelte` file.
 *
 * This is not a hardcoded final identifier. It is a default component-shaped name that is
 * later passed through collision avoidance.
 */
export const RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS = "L4sRuntimeTrans";

/**
 * Runtime export name used to create Lingui accessors for transformed Svelte components.
 *
 * This is referenced when the transform injects imports from the runtime package and needs
 * to know which named export to import.
 *
 * This is a fixed runtime API name, not a generated value.
 */
export const EXPORT_CREATE_LINGUI_ACCESSORS = "createLinguiAccessors";
