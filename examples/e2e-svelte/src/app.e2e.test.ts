import {
  execSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(currentDir, "..");
const workspaceDir = resolve(exampleDir, "..", "..");
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
    execSync("pnpm --filter e2e-svelte build", {
      cwd: workspaceDir,
      stdio: "inherit",
    });

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
  }, 90_000);

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
  });
});
