import { transformAsync } from "@babel/core";
import type { Plugin } from "vite";

const SCRIPT_RE = /\.[cm]?[jt]s$/;
const CORE_MACRO_IMPORT_RE =
  /from\s*["']@lingui\/core\/macro["']|from\s*["']@lingui\/macro["']/;

function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

export default function linguiCoreMacroVite(): Plugin {
  return {
    name: "e2e-astro-lingui-core-macro",
    enforce: "pre",
    async transform(code: string, id: string) {
      if (id.startsWith("\0")) {
        return null;
      }

      const filename = stripQuery(id);
      if (!SCRIPT_RE.test(filename) || !CORE_MACRO_IMPORT_RE.test(code)) {
        return null;
      }

      const transformed = await transformAsync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        plugins: ["macros"],
      });

      if (!transformed?.code) {
        return null;
      }

      return {
        code: transformed.code,
        map: transformed.map ?? null,
      };
    },
  };
}
