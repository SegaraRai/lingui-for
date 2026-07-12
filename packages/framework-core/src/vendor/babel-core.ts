import type { PluginPass } from "@babel/core";

export * from "@babel/core";
export type { ParserOptions } from "@babel/parser";
export type { PluginObject as PluginObj } from "@babel/core";

export function getPluginState<T>(state: PluginPass): PluginPass & T {
  return state as PluginPass & T;
}
