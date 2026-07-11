import type { FileResult, InputOptions } from "@babel/core";

export interface CanonicalSourceMap {
  file?: string | undefined;
  mappings: string;
  names: string[];
  sourceRoot?: string | undefined;
  sources: string[];
  sourcesContent?: string[] | undefined;
  version: number;
}

export interface UnpluginSourceMap {
  file?: string | undefined;
  mappings: string;
  names: string[];
  sourceRoot?: string | undefined;
  sources: string[];
  sourcesContent?: string[] | undefined;
  version: number;
}

export type BabelSourceMap = InputOptions["inputSourceMap"];
export type BabelTransformSourceMap = FileResult["map"];

export function parseCanonicalSourceMap(
  map: string | null | undefined,
): CanonicalSourceMap | null {
  return JSON.parse(map ?? "null") as CanonicalSourceMap | null;
}

export function toUnpluginSourceMap(
  map: CanonicalSourceMap,
): UnpluginSourceMap {
  return map as UnpluginSourceMap;
}

export function fromBabelSourceMap(
  map: BabelTransformSourceMap,
): CanonicalSourceMap | null {
  return (map ?? null) as CanonicalSourceMap | null;
}

export function toBabelSourceMap(
  map: CanonicalSourceMap | null,
): BabelSourceMap | undefined {
  return map == null ? undefined : (map as BabelSourceMap);
}
