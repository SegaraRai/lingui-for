import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(currentDir, "..");
const port = 41731;
const origin = `http://127.0.0.1:${port}`;

type LocaleCode = "en" | "ja";

type PlaygroundRouteExpectation = {
  path: string;
  expectations: Record<LocaleCode, string[]>;
};

let server: ChildProcessWithoutNullStreams | undefined;
let serverOutput = "";

async function waitForServer(url: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is not ready yet.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`);
}

describe.sequential("e2e-svelte application", () => {
  beforeAll(async () => {
    server = spawn("node", [".sveltekit-build/index.js"], {
      cwd: exampleDir,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        ORIGIN: origin,
        PORT: String(port),
      },
      stdio: "pipe",
    });

    server.stdout.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    await waitForServer(`${origin}/`);
  }, 30_000);

  afterAll(() => {
    server?.kill();
  });

  it("renders the main app home route in english", async () => {
    const response = await fetch(`${origin}/?lang=en`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Lingui in a small SvelteKit application");
    expect(html).toContain("The server remembers your preferred language");
    expect(html).toContain("Messages live next to the code that renders them");
    expect(html).toContain('href="/settings"');
    expect(html).toContain("playground");
  });

  it("renders the main app settings route in japanese", async () => {
    const response = await fetch(`${origin}/settings?lang=ja`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain("言語設定");
    expect(html).toContain("現在の言語");
    expect(html).toContain("日本語");
    expect(html).toContain("ヘッダーの切り替え");
  });

  const playgroundRoutes: PlaygroundRouteExpectation[] = [
    {
      path: "/playground/basic",
      expectations: {
        en: [
          "Direct macros in components and plain modules",
          "Immediate translation in markup.",
          "Hello Svelte from the basic route.",
          "Descriptor from a plain TypeScript helper.",
        ],
        ja: [
          "コンポーネントと通常のモジュールで直接マクロを使う",
          "マークアップ内でそのまま翻訳する例。",
          "ベーシックルートからこんにちは、Svelte。",
          "通常の TypeScript ヘルパーからのディスクリプタ。",
        ],
      },
    },
    {
      path: "/playground/reactive",
      expectations: {
        en: [
          "$t and rune-backed state",
          "Hello SvelteKit from the reactive route.",
          "Count: 2",
          "Descriptor from a .svelte.ts module.",
        ],
        ja: [
          "$t とルーンベースのステート",
          "リアクティブルートからこんにちは、SvelteKit。",
          "件数: 2",
          ".svelte.ts モジュールからのディスクリプタ。",
        ],
      },
    },
    {
      path: "/playground/syntax",
      expectations: {
        en: [
          "$t across Svelte syntax positions",
          "Status summary: idle",
          "Filter text: (empty)",
          "Row 1: placeholder",
          "Keyed subtree revision 1",
        ],
        ja: [
          "Svelte 構文の各所で使う $t",
          "状態サマリー: アイドル",
          "フィルタ文字列: （未入力）",
          "行 1: placeholder",
          "キー付きサブツリーのリビジョン 1",
        ],
      },
    },
    {
      path: "/playground/rich-text",
      expectations: {
        en: [
          "Embedded elements and components inside Trans",
          'href="/settings"',
          "cookie-backed locale",
          "semantic emphasis",
        ],
        ja: [
          "Trans 内の埋め込み要素とコンポーネント",
          'href="/settings"',
          "クッキーで保持されるロケール",
          "意味のある強調",
        ],
      },
    },
    {
      path: "/playground/components",
      expectations: {
        en: [
          "ICU component macros",
          "2 component tasks are queued",
          "They approve the locale switch.",
          "2nd release candidate",
        ],
        ja: [
          "ICU コンポーネントマクロ",
          "コンポーネントタスクは 2 件待機中です",
          "彼らはロケール切り替えを承認しました。",
          "第 2 リリース候補",
        ],
      },
    },
    {
      path: "/playground/ids",
      expectations: {
        en: [
          "Targeted id, comment, and context coverage",
          "Explicit id from a Trans component.",
          "Explicit id from t({...}).",
          "Explicit id from a plain descriptor.",
        ],
        ja: [
          "id、コメント、コンテキストの確認に絞る",
          "Trans コンポーネントからの明示的な id。",
          "t({...}) からの明示的な id。",
          "ディスクリプタからの明示的な id。",
        ],
      },
    },
  ];

  for (const playgroundRoute of playgroundRoutes) {
    for (const locale of ["en", "ja"] as const) {
      it(`renders ${playgroundRoute.path} in ${locale}`, async () => {
        const response = await fetch(
          `${origin}${playgroundRoute.path}?lang=${locale}`,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain(`<html lang="${locale}">`);

        for (const expectedText of playgroundRoute.expectations[locale]) {
          expect(html).toContain(expectedText);
        }
      });
    }
  }
});
