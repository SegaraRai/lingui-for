import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { normalizePath } from "../fs/paths.ts";
import { unpluginFactory } from "./factory.ts";

type PluginHooks = {
  rollup?: {
    options?: (inputOptions: {
      input?: Record<string, string>;
    }) => { input?: Record<string, string> } | null | undefined;
  };
  rolldown?: {
    options?: (inputOptions: {
      input?: Record<string, string>;
    }) => { input?: Record<string, string> } | null | undefined;
  };
  vite?: {
    options?: (inputOptions: {
      input?: Record<string, string>;
    }) => { input?: Record<string, string> } | null | undefined;
  };
  buildStart?: (this: {
    addWatchFile: (fileName: string) => void;
    emitFile: (
      file:
        | {
            type: "asset";
            fileName: string;
            originalFileName?: string;
            source: string;
          }
        | { type: "chunk"; fileName: string; id: string },
    ) => void;
  }) => void;
  load?: (id: string) => string | null | undefined;
  resolveId?: (
    source: string,
    importer?: string,
  ) => string | null | undefined | { id: string; external?: boolean };
  buildEnd?: () => void;
};

describe("unplugin-markup-import lifecycle", () => {
  it("filters scanned markup files with include and exclude globs", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "unplugin-markup-import-"));

    try {
      writeFixture(fixtureDir);

      const plugin = unpluginFactory(
        {
          exclude: ["**/*.test.svelte"],
          frameworks: ["svelte"],
          include: ["runtime/**/*.svelte"],
          rootDir: fixtureDir,
          sourceDir: join(fixtureDir, "src"),
        },
        {} as never,
      ) as PluginHooks;
      expect(plugin.rollup?.options).toBeTypeOf("function");
      expect(plugin.rolldown?.options).toBeTypeOf("function");
      expect(plugin.vite?.options).toBeTypeOf("function");
      const entryPath = normalizePath(
        join(fixtureDir, "src", "runtime", "index.ts"),
      );
      const runtimeTransPath = normalizePath(
        join(fixtureDir, "src", "runtime", "RuntimeTrans.svelte"),
      );
      const tempDir = join(fixtureDir, "src", ".unplugin-markup-import");
      const emittedFiles: Array<
        | {
            type: "asset";
            fileName: string;
            originalFileName?: string;
            source: string;
          }
        | { type: "chunk"; fileName: string; id: string }
      > = [];
      const watchedFiles: string[] = [];

      const optionsResult = plugin.rolldown?.options?.({
        input: {
          "runtime/index": entryPath,
        },
      }) as { input?: Record<string, string> } | null | undefined;

      expect(optionsResult?.input).toMatchObject({
        "runtime/index": entryPath,
        "runtime/RuntimeTrans.svelte.imports": expect.stringContaining(
          ".unplugin-markup-import/RuntimeTrans-svelte-imports-mjs-",
        ),
      });
      expect(Object.keys(optionsResult?.input ?? {})).toEqual([
        "runtime/index",
        "runtime/RuntimeTrans.svelte.imports",
      ]);
      expect(existsSync(tempDir)).toBe(true);
      expect(
        readdirSync(tempDir).filter((fileName) => fileName.endsWith(".mts")),
      ).toHaveLength(1);
      expect(plugin.resolveId?.("./RuntimeTrans.svelte", entryPath)).toBe(
        "\0unplugin-markup-import-proxy:.%2FRuntimeTrans.svelte",
      );
      expect(
        plugin.load?.("\0unplugin-markup-import-proxy:.%2FRuntimeTrans.svelte"),
      ).toBe(
        'export { default } from "./RuntimeTrans.svelte?unplugin-markup-import-public";\n',
      );

      plugin.buildStart?.call({
        addWatchFile(fileName: string) {
          watchedFiles.push(fileName);
        },
        emitFile(
          file:
            | {
                type: "asset";
                fileName: string;
                originalFileName?: string;
                source: string;
              }
            | { type: "chunk"; fileName: string; id: string },
        ) {
          emittedFiles.push(file);
        },
      });

      expect(watchedFiles).toEqual([runtimeTransPath]);
      expect(emittedFiles).toEqual([
        expect.objectContaining({
          fileName: "runtime/RuntimeTrans.svelte",
          source: expect.stringContaining("./RuntimeTrans.svelte.imports.mjs"),
          type: "asset",
        }),
      ]);
      expect(
        readdirSync(tempDir).some((fileName) => fileName.endsWith(".mjs")),
      ).toBe(false);

      plugin.buildEnd?.();
      expect(existsSync(tempDir)).toBe(false);
    } finally {
      rmSync(fixtureDir, {
        force: true,
        recursive: true,
      });
    }
  });
});

function writeFixture(fixtureDir: string): void {
  mkdirSync(join(fixtureDir, "src", "runtime"), {
    recursive: true,
  });
  mkdirSync(join(fixtureDir, "src", "sandbox"), {
    recursive: true,
  });

  writeFileSync(
    join(fixtureDir, "src", "runtime", "index.ts"),
    'export { default as RuntimeTrans } from "./RuntimeTrans.svelte";\n',
  );

  writeFileSync(
    join(fixtureDir, "src", "runtime", "helper.ts"),
    dedent`
      export type MessageDescriptor = {
        id: string;
      };

      export function getMessageId(message: MessageDescriptor): string {
        return message.id;
      }
    `,
  );

  writeFileSync(
    join(fixtureDir, "src", "runtime", "RuntimeTrans.svelte"),
    dedent`
      <script lang="ts">
        import type { MessageDescriptor } from "./helper.ts";
        import { getMessageId } from "./helper.ts";

        let { message }: { message: MessageDescriptor } = $props();
      </script>

      <p>{getMessageId(message)}</p>
    `,
  );

  writeFileSync(
    join(fixtureDir, "src", "runtime", "Unused.test.svelte"),
    "<p>unused</p>\n",
  );

  writeFileSync(
    join(fixtureDir, "src", "sandbox", "Other.svelte"),
    "<p>ignored</p>\n",
  );
}
