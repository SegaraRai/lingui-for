import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const sites = {
  docs: {
    source: "apps/docs/dist",
    origin: "https://lingui-for.roundtrip.dev",
    previewDomain: "lingui-for-preview.roundtrip.dev",
    worker: "lingui-for-docs",
  },
} as const;

export type Site = keyof typeof sites;

export type Deployment = "preview" | "production";

/**
 * Returns the origin that a named Preview receives on the site's Preview domain.
 */
export function previewOrigin(site: Site, preview: string): string {
  return `https://${preview}.${sites[site].previewDomain}/`;
}

/**
 * Accepts a site identifier used by the deployment tasks. Throws for unknown sites.
 */
export function parseSite(value: string | undefined): Site {
  if (value !== "docs") {
    throw new Error("Expected site: docs");
  }
  return value;
}

/**
 * Accepts the deployment mode used to prepare headers. Throws for unknown modes.
 */
export function parseDeployment(value: string | undefined): Deployment {
  if (value !== "preview" && value !== "production") {
    throw new Error("Set SITE_DEPLOYMENT to preview or production");
  }
  return value;
}

/**
 * Copies a built site under the workspace's .deploy directory and returns its path.
 * Excludes build metadata and source maps, and blocks Preview indexing.
 * Throws when the build is missing, contains symlinks, or exceeds Workers Free asset limits.
 */
export async function prepareSite(
  root: string,
  site: Site,
  deployment: Deployment,
): Promise<string> {
  const source = path.resolve(root, sites[site].source);
  const outputRoot = path.resolve(root, ".deploy");
  const output = path.resolve(outputRoot, site);
  if (path.dirname(output) !== outputRoot) {
    throw new Error(`Invalid deployment directory: ${output}`);
  }
  await stat(path.join(source, "index.html"));
  let count = 0;
  async function check(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (excluded(entry.name)) {
        continue;
      }
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Static assets must be regular files: ${file}`);
      }
      if (entry.isDirectory()) {
        await check(file);
      } else {
        const { size } = await stat(file);
        if (size > 25 * 1024 * 1024) {
          throw new Error(
            `Static asset exceeds 25 MiB: ${file} (${size} bytes)`,
          );
        }
        count++;
      }
    }
  }
  await check(source);
  if (count + 2 > 20_000) {
    throw new Error(`Static site exceeds 20,000 files: ${count}`);
  }
  await mkdir(outputRoot, { recursive: true });
  await rm(output, { recursive: true, force: true });
  await cp(source, output, {
    recursive: true,
    filter: (file) => !excluded(path.basename(file)),
  });
  if (deployment === "preview") {
    let headers = "";
    try {
      headers = await readFile(path.join(output, "_headers"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await writeFile(
      path.join(output, "_headers"),
      `${headers}\n/*\n  X-Robots-Tag: noindex\n`,
    );
    await writeFile(
      path.join(output, "robots.txt"),
      "User-agent: *\nDisallow: /\n",
    );
  }
  console.log(`Prepared ${site}: ${count} files in ${output}`);
  return output;
}

function excluded(name: string): boolean {
  return (
    (name.startsWith(".") && name !== ".well-known") ||
    name.endsWith(".map") ||
    name === "CNAME" ||
    name === "stillwind-manifest.json"
  );
}

if (import.meta.main) {
  await prepareSite(
    path.resolve(import.meta.dirname, "../.."),
    parseSite(process.argv[2]),
    parseDeployment(process.env.SITE_DEPLOYMENT),
  );
}
