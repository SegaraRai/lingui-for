import type { TransRenderNode as SharedTransRenderNode } from "@lingui-for/internal-shared-runtime";
import type { Snippet } from "svelte";

export type TransComponentSnippet = Snippet<[Snippet] | []>;

export type TransComponentSnippetMap = Readonly<
  Partial<Record<string, TransComponentSnippet>>
>;

export type TransRenderNode = SharedTransRenderNode;
