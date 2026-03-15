import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(currentDir, "..");
const port = 41741;
const origin = `http://127.0.0.1:${port}`;

let server: ChildProcessWithoutNullStreams | undefined;
let serverOutput = "";

async function waitForServer(url: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(
        `Server exited before responding with code ${server.exitCode}\n${serverOutput}`,
      );
    }

    try {
      const response = await fetch(url);
      if (response.status > 0) {
        return;
      }
    } catch {
      // Server boot in progress.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`);
}

describe.sequential("e2e-astro application", () => {
  beforeAll(async () => {
    server = spawn("node", ["dist/server/entry.mjs"], {
      cwd: exampleDir,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
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

  it("renders the overview route with links to every verification page", async () => {
    const response = await fetch(`${origin}/?lang=en`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Lingui Astro multi-page playground");
    expect(html).toContain("One Astro app, several translation checkpoints");
    expect(html).toContain("Current page: Overview");
    expect(html).toContain('href="/server"');
    expect(html).toContain('href="/islands"');
    expect(html).toContain('href="/rich-text"');
    expect(html).toContain('href="/formats"');
    expect(html).toContain('href="/routing/alpha"');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('href="/transitions"');
  });

  it("renders the server and islands routes in english", async () => {
    const serverResponse = await fetch(`${origin}/server?lang=en`);
    const serverHtml = await serverResponse.text();
    const islandsResponse = await fetch(`${origin}/islands?lang=en`);
    const islandsHtml = await islandsResponse.text();

    expect(serverResponse.status).toBe(200);
    expect(serverHtml).toContain("Server translation checks");
    expect(serverHtml).toContain(
      "Astro pages render request-scoped translations through locals.",
    );
    expect(serverHtml).toContain(
      "The current locale label is English, and it comes from the same request.",
    );

    expect(islandsResponse.status).toBe(200);
    expect(islandsHtml).toContain("Island translation checks");
    expect(islandsHtml).toContain(
      "Svelte and React islands read the same active locale.",
    );
    expect(islandsHtml).toContain("Svelte macros keep working inside Astro.");
    expect(islandsHtml).toContain(
      "React components can translate Lingui descriptors inside Astro.",
    );
  });

  it("renders rich text and format routes in english", async () => {
    const richTextResponse = await fetch(`${origin}/rich-text?lang=en`);
    const richTextHtml = await richTextResponse.text();
    const formatsResponse = await fetch(`${origin}/formats?lang=en`);
    const formatsHtml = await formatsResponse.text();

    expect(richTextResponse.status).toBe(200);
    expect(richTextHtml).toContain("Rich text translation checks");
    expect(richTextHtml).toContain(
      'Astro keeps the <a href="/settings">docs link</a> inside a translated sentence.',
    );
    expect(richTextHtml).toContain(
      'React keeps the <a href="/settings">settings link</a> inside a translated sentence.',
    );

    expect(formatsResponse.status).toBe(200);
    expect(formatsHtml).toContain("Format macro checks");
    expect(formatsHtml).toContain("3 Astro format samples");
    expect(formatsHtml).toContain("Astro select says excited.");
    expect(formatsHtml).toContain("Astro finished 2nd.");
    expect(formatsHtml).toContain(
      "Svelte runs plural, select, and selectOrdinal macros in component code.",
    );
  });

  it("reuses the locale cookie on routing and settings routes", async () => {
    const initial = await fetch(`${origin}/server?lang=ja`);
    const initialHtml = await initial.text();
    const cookie = initial.headers.get("set-cookie");

    expect(cookie).toBeTruthy();
    expect(initialHtml).toContain('<html lang="ja">');
    expect(initialHtml).toContain("サーバー翻訳の確認");
    expect(initialHtml).toContain(
      "Astro のページは locals 経由でリクエスト単位の翻訳を描画します。",
    );

    const routingResponse = await fetch(`${origin}/routing/alpha`, {
      headers: {
        Cookie: cookie ?? "",
      },
    });
    const routingHtml = await routingResponse.text();

    expect(routingResponse.status).toBe(200);
    expect(routingHtml).toContain('<html lang="ja">');
    expect(routingHtml).toContain("動的ルートの確認");
    expect(routingHtml).toContain("現在表示中の slug は alpha です。");
    expect(routingHtml).toContain(
      "ここでもロケールクッキーが適用されるため、翻訳されたページは前のリクエストと一致します。",
    );

    const settingsResponse = await fetch(`${origin}/settings`, {
      headers: {
        Cookie: cookie ?? "",
      },
    });
    const settingsHtml = await settingsResponse.text();

    expect(settingsResponse.status).toBe(200);
    expect(settingsHtml).toContain("言語設定");
    expect(settingsHtml).toContain("現在のロケール: 日本語");
    expect(settingsHtml).toContain(
      "Astro はリクエスト単位の locals を使います。",
    );
    expect(settingsHtml).toContain(
      "React は I18nProvider 経由で Lingui を読み取ります。",
    );
  });

  it("renders transition routes with and without ClientRouter", async () => {
    const indexResponse = await fetch(`${origin}/transitions?lang=en`);
    const indexHtml = await indexResponse.text();
    const noRouterResponse = await fetch(
      `${origin}/transitions/no-router/a?lang=en`,
    );
    const noRouterHtml = await noRouterResponse.text();
    const routerResponse = await fetch(
      `${origin}/transitions/router/a?lang=en`,
    );
    const routerHtml = await routerResponse.text();

    expect(indexResponse.status).toBe(200);
    expect(indexHtml).toContain("Client transition checks");
    expect(indexHtml).toContain("Open no-router demo");
    expect(indexHtml).toContain("Open router demo");
    expect(indexHtml).toContain(
      "compare whether counters survive while locale and page props still update.",
    );

    expect(noRouterResponse.status).toBe(200);
    expect(noRouterHtml).toContain("Transition demo without ClientRouter");
    expect(noRouterHtml).toContain("Volatile Svelte island");
    expect(noRouterHtml).toContain("Persisted-props React island");
    expect(noRouterHtml).not.toContain('name="astro-view-transitions-enabled"');

    expect(routerResponse.status).toBe(200);
    expect(routerHtml).toContain("Transition demo with ClientRouter");
    expect(routerHtml).toContain("Persisted Svelte island");
    expect(routerHtml).toContain("Persisted-props React island");
    expect(routerHtml).toContain("Svelte props say Router page A in English.");
    expect(routerHtml).toContain('name="astro-view-transitions-enabled"');
  });
});
