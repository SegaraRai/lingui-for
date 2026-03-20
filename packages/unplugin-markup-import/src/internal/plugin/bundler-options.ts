import type { FrameworkHandler } from "../markup/frameworks/registry.ts";
import { scanGeneratedMarkups, type LifecycleContext } from "./lifecycle.ts";
import type {
  BuildInput,
  BundlerInputOptions,
  GeneratedMarkupRecord,
  ScanFilter,
} from "./types.ts";

export function createBundlerOptionsHook(
  sourceDir: string,
  tempDir: string,
  handlers: readonly FrameworkHandler[],
  scanFilter: ScanFilter,
  lifecycleContext: LifecycleContext,
): <T extends BundlerInputOptions>(inputOptions: T) => T | null {
  return (inputOptions) => {
    scanGeneratedMarkups(
      sourceDir,
      tempDir,
      handlers,
      scanFilter,
      lifecycleContext,
    );

    const { input, injected } = injectFacadeEntries(
      inputOptions.input,
      lifecycleContext.generatedMarkups,
    );

    if (!injected) {
      return null;
    }

    return {
      ...inputOptions,
      input,
    };
  };
}

function injectFacadeEntries(
  input: BuildInput,
  generatedMarkups: ReadonlyMap<string, GeneratedMarkupRecord>,
): {
  input: BuildInput;
  injected: boolean;
} {
  if (!isInputRecord(input)) {
    return {
      input,
      injected: false,
    };
  }

  const facadeEntries = Object.fromEntries(
    [...generatedMarkups.values()]
      .filter(
        (generatedMarkup) =>
          generatedMarkup.facadeFileName && generatedMarkup.facadeTempPath,
      )
      .map((generatedMarkup) => [
        toFacadeEntryName(generatedMarkup.facadeFileName!),
        generatedMarkup.facadeTempPath!,
      ]),
  );

  if (Object.keys(facadeEntries).length === 0) {
    return {
      input,
      injected: false,
    };
  }

  return {
    input: {
      ...input,
      ...facadeEntries,
    },
    injected: true,
  };
}

function isInputRecord(input: BuildInput): input is Record<string, string> {
  return Boolean(input && !Array.isArray(input) && typeof input === "object");
}

function toFacadeEntryName(facadeFileName: string): string {
  return facadeFileName.replace(/\.mjs$/u, "");
}
