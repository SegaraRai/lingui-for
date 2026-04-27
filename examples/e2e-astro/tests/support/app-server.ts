import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { dirname, resolve } from "node:path";

const HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 30_000;
const projectRoot = resolve(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);
const astroPackageJsonPath = require.resolve("astro/package.json", {
  paths: [projectRoot],
});
const astroPackageJson = require(astroPackageJsonPath) as {
  bin?: { astro?: string };
};
const astroCliEntry = resolve(
  dirname(astroPackageJsonPath),
  astroPackageJson.bin?.astro ?? "bin/astro.mjs",
);
const previewEntry = resolve(projectRoot, "dist/server/entry.mjs");

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
          new Error(
            "Failed to allocate a local port for the Astro test server.",
          ),
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
  getExitCode: () => number | null | undefined,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    const exitCode = getExitCode();
    if (exitCode !== null && exitCode !== undefined) {
      throw new Error(
        `Server exited before responding with code ${exitCode}\n${getOutput()}`,
      );
    }

    try {
      const response = await fetch(url);
      if (response.status > 0) {
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
      "Preview server artifacts are missing. Run `vp run build` in examples/e2e-astro before executing preview tests.",
    );
  }
}

export class AppServer {
  private readonly mode: ServerMode;
  private readonly outputChunks: string[] = [];
  private child: ChildProcessWithoutNullStreams | undefined;
  private port: number | undefined;

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
    this.child =
      this.mode === "dev"
        ? this.startDevServer(this.port)
        : await this.startPreviewServer(this.port);

    await waitForServer(
      `${this.origin}/`,
      () => this.outputChunks.join(""),
      () => this.child?.exitCode,
    );
  }

  async close(): Promise<void> {
    if (!this.child) {
      this.port = undefined;
      this.outputChunks.length = 0;
      return;
    }

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

    this.port = undefined;
    this.outputChunks.length = 0;
  }

  async fetch(pathname: string, init?: RequestInit): Promise<Response> {
    return await fetch(new URL(pathname, this.origin), init);
  }

  private startDevServer(port: number): ChildProcessWithoutNullStreams {
    const child = spawn(
      process.execPath,
      [astroCliEntry, "dev", "--host", HOST, "--port", String(port)],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: "1",
        },
        stdio: "pipe",
      },
    );

    child.stdout.on("data", (chunk: Buffer) => {
      this.outputChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.outputChunks.push(chunk.toString());
    });

    return child;
  }

  private async startPreviewServer(
    port: number,
  ): Promise<ChildProcessWithoutNullStreams> {
    await assertPreviewBuildExists();

    const child = spawn(process.execPath, [previewEntry], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
        HOST,
        PORT: String(port),
      },
      stdio: "pipe",
    });

    child.stdout.on("data", (chunk: Buffer) => {
      this.outputChunks.push(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.outputChunks.push(chunk.toString());
    });

    return child;
  }
}
