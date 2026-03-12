import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    execSync("pnpm --filter lingui-svelte build", {
      cwd: workspaceDir,
      stdio: "inherit",
    });
    execSync("pnpm --filter e2e-svelte build", {
      cwd: workspaceDir,
      stdio: "inherit",
    });

    server = spawn("node", ["build"], {
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

    await waitForServer(`${origin}/playground`);
  }, 90_000);

  afterAll(() => {
    server?.kill();
  });

  it("renders tagged template literals from script, markup, raw ts, and .svelte.ts", async () => {
    const response = await fetch(`${origin}/playground`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Tagged template literal from route script.");
    expect(html).toContain("Tagged template literal from markup expression.");
    expect(html).toContain("Tagged template descriptor from raw TypeScript.");
    expect(html).toContain("Tagged template descriptor from .svelte.ts state.");
  });
});
