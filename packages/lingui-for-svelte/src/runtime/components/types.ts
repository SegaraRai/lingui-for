import type { Component } from "svelte";

export type TransComponentDescriptor =
  | {
      kind: "element";
      tag: string;
      props?: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "component";
      component: Component<any>;
      props?: Readonly<Record<string, unknown>>;
    };

export type TransComponentMap = Readonly<
  Record<string, TransComponentDescriptor>
>;

export type TransRenderNode =
  | string
  | {
      kind: "component";
      key: string;
      name: string;
      children: readonly TransRenderNode[];
    };
