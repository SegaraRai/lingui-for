import type { TransRenderNode as SharedTransRenderNode } from "@lingui-for/framework-core/runtime";
import type { Snippet } from "svelte";

export type TransComponentSnippet = Snippet<[Snippet | undefined]>;

export type TransComponentSnippetMap = ReadonlyMap<
  string,
  TransComponentSnippet
>;

export type TransRenderNode = SharedTransRenderNode;
