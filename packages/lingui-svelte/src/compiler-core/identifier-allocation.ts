import { transformSync, type PluginObj } from "@babel/core";

import { getParserPlugins } from "./config.ts";
import type { ScriptLang } from "./types.ts";

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

export type UniqueNameAllocator = (hint: string) => string;

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
