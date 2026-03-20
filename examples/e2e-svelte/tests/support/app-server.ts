import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer as createViteServer, type ViteDevServer } from "vite";

const HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 30_000;
const projectRoot = resolve(import.meta.dirname, "..", "..");
const previewEntry = resolve(projectRoot, ".sveltekit-build", "index.js");

export const serverModes = ["dev", "preview"] as const;

export type ServerMode = (typeof serverModes)[number];

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const probeServer = createNetServer();

    probeServer.once("error", reject);
    probeServer.listen(0, HOST, () => {
      const address = probeServer.address();

      if (!address || typeof address === "string") {
        reject(
          new Error("Failed to allocate a local port for the test server."),
        );
        return;
      }

      probeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

async function waitForServer(
  url: string,
  getOutput: () => string,
  getExitCode?: () => number | null | undefined,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    const exitCode = getExitCode?.();
    if (exitCode !== null && exitCode !== undefined) {
      throw new Error(
        `Server exited before responding with code ${exitCode}\n${getOutput()}`,
      );
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server startup is still in progress.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new Error(`Timed out waiting for ${url}\n${getOutput()}`);
}

async function assertPreviewBuildExists(): Promise<void> {
  try {
    await access(previewEntry, fsConstants.F_OK);
  } catch {
    throw new Error(
      "Preview server artifacts are missing. Run `vp run build` in examples/e2e-svelte before executing preview tests.",
    );
  }
}

export class AppServer {
  private readonly mode: ServerMode;
  private readonly outputChunks: string[] = [];
  private child: ChildProcessWithoutNullStreams | undefined;
  private port: number | undefined;
  private previousCwd: string | undefined;
  private viteServer: ViteDevServer | undefined;

  constructor(mode: ServerMode) {
    this.mode = mode;
  }

  get origin(): string {
    if (this.port === undefined) {
      throw new Error("Server has not been started yet.");
    }

    return `http://${HOST}:${this.port}`;
  }

  async start(): Promise<void> {
    if (this.port !== undefined) {
      return;
    }

    this.port = await getAvailablePort();

    if (this.mode === "dev") {
      await this.startDevServer();
    } else {
      await this.startPreviewServer();
    }

    await waitForServer(
      `${this.origin}/`,
      () => this.outputChunks.join(""),
      () => this.child?.exitCode,
    );
  }

  async close(): Promise<void> {
    if (this.viteServer) {
      try {
        await this.viteServer.close();
      } finally {
        this.viteServer = undefined;
        if (this.previousCwd) {
          process.chdir(this.previousCwd);
          this.previousCwd = undefined;
        }
      }
    }

    if (this.child) {
      const runningChild = this.child;
      this.child = undefined;

      await new Promise<void>((resolveClose) => {
        if (runningChild.exitCode !== null) {
          resolveClose();
          return;
        }

        runningChild.once("exit", () => resolveClose());
        runningChild.kill();
      });
    }

    this.port = undefined;
    this.outputChunks.length = 0;
  }

  async fetch(pathname: string, init?: RequestInit): Promise<Response> {
    return await fetch(new URL(pathname, this.origin), init);
  }

  private async startDevServer(): Promise<void> {
    this.previousCwd = process.cwd();
    process.chdir(projectRoot);

    try {
      this.viteServer = await createViteServer({
        configFile: resolve(projectRoot, "vite.config.ts"),
        server: {
          host: HOST,
          port: this.port,
          strictPort: true,
        },
      });
      await this.viteServer.listen();
    } catch (error) {
      if (this.previousCwd) {
        process.chdir(this.previousCwd);
        this.previousCwd = undefined;
      }

      throw error;
    }
  }

  private async startPreviewServer(): Promise<void> {
    await assertPreviewBuildExists();

    this.child = spawn("node", [previewEntry], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOST,
        ORIGIN: this.origin,
        PORT: String(this.port),
      },
      stdio: "pipe",
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.outputChunks.push(chunk.toString());
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.outputChunks.push(chunk.toString());
    });
  }
}
