import { describe, expect, test } from "vite-plus/test";

import { createTempFilePath } from "./temp-files.ts";

describe("createTempFilePath", () => {
  test("uses a dot-stripped original filename and content hash", () => {
    expect(
      createTempFilePath(
        "C:/Workspace/src/.unplugin-markup-import",
        "runtime/trans/RuntimeTrans.svelte.imports.mjs",
        'export { default } from "./RuntimeTrans.svelte";\n',
        ".mjs",
      ),
    ).toMatch(
      /^C:\/Workspace\/src\/\.unplugin-markup-import\/RuntimeTrans-svelte-imports-mjs-[0-9a-f]{10}\.mjs$/,
    );
  });
});
