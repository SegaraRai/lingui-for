import MagicString from "magic-string";
import type { EncodedSourceMap } from "@jridgewell/gen-mapping";

export type ReplacementChunk = {
  start: number;
  end: number;
  code: string;
};

export function buildOutputWithIndexedMap(
  source: string,
  mapFile: string,
  replacements: ReplacementChunk[],
): { code: string; map: EncodedSourceMap } {
  const ms = new MagicString(source, { filename: mapFile });

  const sorted = replacements
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let cursor = 0;

  for (const replacement of sorted) {
    if (replacement.start < cursor) {
      continue;
    }

    if (replacement.start === replacement.end) {
      ms.appendLeft(replacement.start, replacement.code);
    } else {
      ms.overwrite(replacement.start, replacement.end, replacement.code);
      cursor = replacement.end;
    }
  }

  const rawMap = ms.generateMap({
    source: mapFile,
    file: mapFile,
    includeContent: true,
    hires: "boundary",
  }) as unknown as EncodedSourceMap;
  // MagicString computes `sources` relative to `file`, which collapses to the
  // basename when source === file.  Override with the absolute path so callers
  // always get the canonical filename back.
  rawMap.sources = [mapFile];
  rawMap.file = mapFile;
  return { code: ms.toString(), map: rawMap };
}
