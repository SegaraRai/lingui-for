import type { TransRenderNode as SharedTransRenderNode } from "@lingui-for/internal-shared-runtime";

export type TransComponentDescriptor =
  | {
      kind: "element";
      tag: string;
      props?: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "component";
      component: () => unknown;
      props?: Readonly<Record<string, unknown>>;
    };

export type TransComponentMap = Readonly<
  Record<string, TransComponentDescriptor>
>;

export type TransRenderNode = SharedTransRenderNode;
