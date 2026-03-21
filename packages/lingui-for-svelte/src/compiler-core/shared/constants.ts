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
 * Prefix used for synthetic variables that stand in for extracted markup expressions.
 *
 * This is used when a `.svelte` file is lifted into a temporary JS/TS program so Babel
 * and Lingui can transform markup expressions as ordinary declarations.
 *
 * This is not used as a final identifier directly. Real names are formed by appending an
 * index, and later matched by this prefix when lowering the transformed output back into
 * Svelte source.
 */
export const SYNTHETIC_PREFIX_EXPRESSION = "__lingui_for_svelte_expr_";

/**
 * Prefix used for synthetic variables that stand in for component macros such as `Trans`.
 *
 * This is used during synthetic-program construction before component macro output is
 * lowered back into runtime Svelte components.
 *
 * This is a prefix rather than a final fixed name. Real identifiers are formed by
 * appending an index and are later recognized by this prefix.
 */
export const SYNTHETIC_PREFIX_COMPONENT = "__lingui_for_svelte_component_";

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
 * Temporary wrapper function name inserted around explicit eager translations such as
 * `t.eager(...)` and `plural.eager(...)`.
 *
 * This is only an internal Babel-phase marker used so the transform can preserve intentional
 * non-reactive translations while still rejecting bare direct macro calls inside `.svelte` files.
 */
export const EAGER_TRANSLATION_WRAPPER =
  "__lingui_for_svelte_eager_translation__";

/** Property name used by Svelte macros for explicit eager translations. */
export const EAGER_TRANSLATION_PROPERTY = "eager";

/** Prefix used by Svelte's reactive macro sugar such as `$t` and `$plural`. */
export const REACTIVE_MACRO_PREFIX = "$";

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
