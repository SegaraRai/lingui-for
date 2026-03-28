import * as babelTraverseModule from "@babel/traverse";

type BabelTraverse = typeof import("@babel/traverse").default;

function getBabelTraverse(): BabelTraverse {
  const moduleValue = babelTraverseModule as unknown as {
    default?: BabelTraverse | { default?: BabelTraverse };
  };

  if (typeof moduleValue.default === "function") {
    return moduleValue.default;
  }

  if (typeof moduleValue.default?.default === "function") {
    return moduleValue.default.default;
  }

  throw new TypeError(
    "Unable to resolve @babel/traverse default export at runtime.",
  );
}

export const babelTraverse = /*#__PURE__*/ getBabelTraverse();
