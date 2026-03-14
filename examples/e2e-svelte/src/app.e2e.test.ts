import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(currentDir, "..");
const port = 41731;
const origin = `http://127.0.0.1:${port}`;

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

    await waitForServer(`${origin}/playground?lang=en`);
  }, 30_000);

  afterAll(() => {
    server?.kill();
  });

  it("renders compiled english catalogs on the playground route", async () => {
    const response = await fetch(`${origin}/playground?lang=en`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Playground");
    expect(html).toContain("Tagged template literal from route script.");
    expect(html).toContain("Tagged template literal from markup expression.");
    expect(html).toContain("Tagged template descriptor from raw TypeScript.");
    expect(html).toContain("Tagged template descriptor from .svelte.ts state.");
    expect(html).toContain("Hello SvelteKit!");
    expect(html).toContain("2 queued actions for SvelteKit");
    expect(html).toContain("2 component tasks are queued");
    expect(html).toContain("They approve the locale switch.");
    expect(html).toContain("2nd release candidate");
    expect(html).toContain("<code>");
    expect(html).toContain("name");
    expect(html).toContain("count");
    expect(html).toContain("<strong>");
    expect(html).toContain("re-render through Lingui.");
  });

  it("renders compiled english catalogs with rich text on the home route", async () => {
    const response = await fetch(`${origin}/?lang=en`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      "Lingui macros inside routes, components, and plain modules",
    );
    expect(html).toContain('href="/playground?lang=en"');
    expect(html).toContain("embedded elements");
    expect(html).toContain("locale-aware runtime updates.");
  });

  it("renders compiled japanese catalogs on the playground route", async () => {
    const response = await fetch(`${origin}/playground?lang=ja`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("プレイグラウンド");
    expect(html).toContain("route script からのタグ付きテンプレート literal。");
    expect(html).toContain(
      "markup expression からのタグ付きテンプレート literal。",
    );
    expect(html).toContain(
      "通常の TypeScript からのタグ付きテンプレート descriptor。",
    );
    expect(html).toContain(
      ".svelte.ts state からのタグ付きテンプレート descriptor。",
    );
    expect(html).toContain("SvelteKit さん、こんにちは！");
    expect(html).toContain("SvelteKit の待機中アクション 2 件");
    expect(html).toContain("component task は 2 件待機中です");
    expect(html).toContain("ロケール切り替えを承認しました。");
    expect(html).toContain("第 2 リリース候補");
    expect(html).toContain(
      "Lingui 経由で再レンダーされる様子を確認してください。",
    );
  });

  it("renders compiled japanese catalogs with rich text on the home route", async () => {
    const response = await fetch(`${origin}/?lang=ja`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      "ルート、コンポーネント、素のモジュールで Lingui macro を使う",
    );
    expect(html).toContain('href="/playground?lang=ja"');
    expect(html).toContain("埋め込み要素");
    expect(html).toContain(
      "ロケールに応じたランタイム更新を確認してください。",
    );
  });
});
