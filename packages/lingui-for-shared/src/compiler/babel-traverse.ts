import * as babelTraverseModule from "@babel/traverse";

export type BabelTraverse = typeof import("@babel/traverse").default;

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
