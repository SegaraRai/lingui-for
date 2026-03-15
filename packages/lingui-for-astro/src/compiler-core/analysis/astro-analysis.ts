import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import initAstroAnalyzer, {
  analyzeAstro as analyzeAstroSync,
} from "astro-analyzer-wasm";

import type { AstroAnalysis } from "./types.ts";

let initPromise: Promise<void> | null = null;

async function resolveAnalyzerWasm(): Promise<Uint8Array | null> {
  const resolvers = [
    createRequire(import.meta.url),
    createRequire(join(process.cwd(), "__lingui_for_astro__.cjs")),
  ];

  for (const nodeRequire of resolvers) {
    try {
      const wasmPath = nodeRequire.resolve("astro-analyzer-wasm/wasm");
      return readFile(wasmPath);
    } catch {
      // Try the next resolver.
    }
  }

  return null;
}

async function ensureAstroAnalyzer(): Promise<void> {
  initPromise ??= (async () => {
    const wasmBytes = await resolveAnalyzerWasm();
    if (wasmBytes) {
      await initAstroAnalyzer({ module_or_path: wasmBytes });
      return;
    }

    await initAstroAnalyzer();
  })();

  await initPromise;
}

export interface AnalyzeAstroResult {
  analysis: AstroAnalysis;
}

export async function analyzeAstro(
  source: string,
): Promise<AnalyzeAstroResult> {
  await ensureAstroAnalyzer();

  return {
    analysis: analyzeAstroSync(source) as AstroAnalysis,
  };
}
