import * as babelTraverseModule from "@babel/traverse";

/**
 * Runtime function signature for `@babel/traverse`.
 */
export type BabelTraverse = typeof import("@babel/traverse").default;

/**
 * Resolves the callable `@babel/traverse` export across differing CJS/ESM interop shapes.
 *
 * @returns The callable Babel `traverse` function.
 *
 * Depending on how the library is bundled and then consumed, `@babel/traverse` may appear either
 * as the function itself or as an object whose nested `default` property contains that function.
 * This helper normalizes those cases so compiler-core can call `traverse(...)` reliably in both
 * source and built output.
 */
export function getBabelTraverse(): BabelTraverse {
  const moduleValue = babelTraverseModule as unknown as {
    default?: BabelTraverse | { default?: BabelTraverse };
  };
  const candidate =
    typeof moduleValue.default === "function"
      ? moduleValue.default
      : typeof moduleValue.default?.default === "function"
        ? moduleValue.default.default
        : null;

  if (!candidate) {
    throw new TypeError(
      "Unable to resolve @babel/traverse default export at runtime.",
    );
  }

  return candidate;
}
