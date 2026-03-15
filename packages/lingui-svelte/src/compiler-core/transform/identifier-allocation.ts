import { transformSync, type PluginObj } from "@babel/core";

import { getParserPlugins } from "../shared/config.ts";
import type { ScriptLang } from "../shared/types.ts";

function collectTopLevelBindings(
  code: string,
  filename: string,
  lang: ScriptLang,
): Set<string> {
  if (!code.trim()) {
    return new Set();
  }

  const bindings = new Set<string>();

  const plugin: PluginObj<{ bindings: Set<string> }> = {
    name: "lingui-for-svelte-collect-bindings",
    pre() {
      this.bindings = bindings;
    },
    visitor: {
      Program(path, state) {
        path.scope.crawl();
        Object.keys(path.scope.bindings).forEach((name) => {
          state.bindings.add(name);
        });
        path.stop();
      },
    },
  };

  transformSync(code, {
    ast: false,
    babelrc: false,
    code: false,
    configFile: false,
    filename,
    parserOpts: {
      sourceType: "module",
      plugins: getParserPlugins(lang),
    },
    plugins: [plugin],
  });

  return bindings;
}

/**
 * Function type that allocates a collision-free identifier from a preferred hint.
 *
 * @param hint Preferred identifier base.
 * @returns A unique identifier that does not collide with already reserved top-level bindings.
 *
 * Allocators of this type are used when the transform injects hidden runtime bindings into a
 * script and must avoid clobbering names chosen by the user.
 */
export type UniqueNameAllocator = (hint: string) => string;

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
  const reserved = collectTopLevelBindings(
    code,
    options.filename,
    options.lang,
  );

  return (hint): string => {
    let candidate = hint;
    let index = 1;
    while (reserved.has(candidate)) {
      candidate = `${hint}_${index}`;
      index += 1;
    }
    reserved.add(candidate);
    return candidate;
  };
}
