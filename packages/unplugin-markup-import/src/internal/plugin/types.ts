import type { InputOptions as InputOptionsRolldown } from "rolldown";
import type { InputOptions as InputOptionsRollup } from "rollup";

export type GeneratedMarkupRecord = {
  sourceId: string;
  relativePath: string;
  assetFileName: string;
  rewrittenCode: string;
  facadeFileName: string | null;
  facadeTempPath: string | null;
};

export type ScanFilter = {
  include: readonly string[];
  exclude: readonly string[];
};

export type BundlerInputOptions = Pick<
  InputOptionsRollup | InputOptionsRolldown,
  "input"
>;

export type BuildInput = BundlerInputOptions["input"];
