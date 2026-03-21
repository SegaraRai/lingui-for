import {
  createUniqueNameAllocator as createSharedUniqueNameAllocator,
  type UniqueNameAllocator,
} from "lingui-for-shared/compiler";

import { getParserPlugins } from "../shared/config.ts";
import type { ScriptLang } from "../shared/types.ts";

/**
 * Creates an allocator for unique top-level identifiers within a given source file.
 *
 * @param code Source text whose existing top-level bindings should be treated as reserved.
 * @param options.filename Filename used while parsing the source with Babel.
 * @param options.lang Parser mode used for Babel (`"js"` or `"ts"`).
 * @returns A {@link UniqueNameAllocator} that appends numeric suffixes when necessary.
 *
 * The allocator first parses the provided source and records every top-level binding. Later
 * calls reserve new names against that same set so injected runtime identifiers remain stable
 * and collision-free within a single transform pass.
 */
export function createUniqueNameAllocator(
  code: string,
  options: {
    readonly filename: string;
    readonly lang: ScriptLang;
  },
): UniqueNameAllocator {
  return createSharedUniqueNameAllocator(code, {
    filename: options.filename,
    parserPlugins: getParserPlugins(options.lang),
  });
}
