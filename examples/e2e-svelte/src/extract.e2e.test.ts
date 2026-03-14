import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(currentDir, "..");
const workspaceDir = resolve(exampleDir, "..", "..");
const localesDir = resolve(exampleDir, "src/lib/i18n/locales");

describe.sequential("lingui cli e2e", () => {
  beforeAll(() => {
    execSync("pnpm --filter lingui-for-svelte build", {
      cwd: workspaceDir,
      stdio: "inherit",
    });
    execSync("pnpm --filter e2e-svelte run lingui:extract", {
      cwd: workspaceDir,
      stdio: "inherit",
    });
    execSync("pnpm --filter e2e-svelte run lingui:compile", {
      cwd: workspaceDir,
      stdio: "inherit",
    });
  }, 90_000);

  it("extracts actual example sources into english and japanese po catalogs", async () => {
    const [englishCatalog, japaneseCatalog] = await Promise.all([
      readFile(resolve(localesDir, "en.po"), "utf8"),
      readFile(resolve(localesDir, "ja.po"), "utf8"),
    ]);

    expect(englishCatalog).toContain('msgid "kit.home.title"');
    expect(englishCatalog).toContain(
      'msgid "Tagged template literal from route script."',
    );
    expect(englishCatalog).toContain('msgid "kit.playground.greeting"');
    expect(englishCatalog).toContain(
      'msgid "Tagged template descriptor from .svelte.ts state."',
    );
    expect(englishCatalog).toContain('msgstr "Hello {name}!"');
    expect(englishCatalog).toContain(
      'msgstr "{count, plural, one {# queued action for {name}} other {# queued actions for {name}}}"',
    );

    expect(japaneseCatalog).toContain(
      'msgstr "route script からのタグ付きテンプレート literal。"',
    );
    expect(japaneseCatalog).toContain(
      'msgstr "{count, plural, one {{name} の待機中アクション # 件} other {{name} の待機中アクション # 件}}"',
    );
    expect(japaneseCatalog).toContain(
      'msgstr "通常の TypeScript からのタグ付きテンプレート descriptor。"',
    );
    expect(japaneseCatalog).toContain('msgstr "{name} さん、こんにちは！"');
  });

  it("compiles both locale catalogs into runtime ts modules", async () => {
    const [englishModule, japaneseModule] = await Promise.all([
      readFile(resolve(localesDir, "en.ts"), "utf8"),
      readFile(resolve(localesDir, "ja.ts"), "utf8"),
    ]);

    expect(englishModule).toContain("export const messages");
    expect(englishModule).toContain(
      "Tagged template literal from markup expression.",
    );
    expect(englishModule).toContain('"kit.playground.greeting"');
    expect(englishModule).toContain('["name"]');
    expect(englishModule).toContain('"plural"');

    expect(japaneseModule).toContain("export const messages");
    expect(japaneseModule).toContain("プレイグラウンド");
    expect(japaneseModule).toContain(
      "route script からのタグ付きテンプレート literal。",
    );
    expect(japaneseModule).toContain('"kit.playground.greeting"');
    expect(japaneseModule).toContain("こんにちは");
    expect(japaneseModule).toContain('"plural"');
  });
});
