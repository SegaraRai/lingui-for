import type { Visitor } from "@babel/traverse";

type BabelTraverse = (typeof import("@babel/traverse"))["default"];

let traversePromise: Promise<BabelTraverse> | null = null;

export async function getBabelTraverse(): Promise<BabelTraverse> {
  if (!traversePromise) {
    traversePromise = import("@babel/traverse").then((module) => {
      const candidate = (
        typeof module.default === "function"
          ? module.default
          : (module.default as { default?: unknown } | undefined)?.default
      ) as BabelTraverse | undefined;

      if (!candidate) {
        throw new Error("Failed to load @babel/traverse");
      }

      return candidate;
    });
  }

  return traversePromise;
}

export type { Visitor };
