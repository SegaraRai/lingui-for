import { spawn } from "node:child_process";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

import { readBuildOutput } from "@cloudflare/build-output-utils";

import { checkPageUrls } from "./check-urls.ts";
import { writeInitialBuild } from "./cloudflare.ts";
import {
  parseSite,
  previewOrigin,
  sites,
  type Deployment,
  type Site,
} from "./prepare.ts";

/**
 * Returns whether a deployment name identifies a pull request's Preview, such as `pr-123`.
 */
export function isPullRequestPreview(name: string | undefined): boolean {
  return /^pr-[1-9]\d*$/.test(name ?? "");
}

/**
 * Maps the two deployment branches and pull request Previews to their destination.
 * Throws for other names.
 */
export function deploymentForBranch(branch: string | undefined): Deployment {
  if (branch === "main" || isPullRequestPreview(branch)) {
    return "preview";
  }
  if (branch === "stable") {
    return "production";
  }
  throw new Error(
    "Site deployments require the main or stable branch, or a pr-<number> Preview",
  );
}

/**
 * Returns the configured build origin from cf's branch Preview URLs.
 * Throws when the origin is not HTTPS or cf did not issue that URL.
 */
export function previewUrl(output: string, origin: string): string {
  const entry = JSON.parse(output) as {
    type?: string;
    preview_urls?: string[];
  };
  const url = new URL(origin);
  if (
    url.protocol === "https:" &&
    entry.type === "preview" &&
    entry.preview_urls?.some((value) => new URL(value).href === url.href)
  ) {
    return url.href;
  }
  throw new Error(
    `cf did not issue the configured HTTPS Preview URL: ${origin}`,
  );
}

/**
 * Uses the account ID and API token to check the named Worker's deployment history.
 * Returns true when the Worker is absent or its production deployment history is empty.
 * Throws when Cloudflare cannot confirm the deployment history.
 */
export async function needsInitialDeployment(
  worker: string,
  account: string,
  token: string,
): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/${encodeURIComponent(worker)}/deployments`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json()) as {
    success?: boolean;
    result?: { deployments?: unknown[] };
    errors?: { code: number }[];
  };
  if (
    response.status === 404 &&
    body.errors?.some((error) => error.code === 10007)
  ) {
    return true;
  }
  if (!response.ok) {
    throw new Error(
      `${worker}: cannot read deployment history: HTTP ${response.status}`,
    );
  }
  if (!body.success || !Array.isArray(body.result?.deployments)) {
    throw new Error(`${worker}: Cloudflare returned no deployment history`);
  }
  return body.result.deployments.length === 0;
}

/**
 * Uses the account ID and API token to delete the named Preview of a Worker.
 * A Preview that does not exist counts as deleted, because a pull request may publish only one site.
 * Throws when Cloudflare reports another failure.
 */
export async function deletePreview(
  worker: string,
  preview: string,
  account: string,
  token: string,
): Promise<void> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/workers/${encodeURIComponent(worker)}/previews/${encodeURIComponent(preview)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `${worker}: cannot delete Preview ${preview}: HTTP ${response.status}`,
    );
  }
}

/**
 * Checks the deployed site's routes, metadata, indexing policy, and trailing slash redirects.
 * Throws when an HTTP request fails or a response breaks the hosting contract.
 */
export async function checkSite(
  site: Site,
  origin: string,
  deployment: Deployment,
): Promise<void> {
  const paths = ["/", "/ja", "/concepts", "/frameworks/svelte/getting-started"];
  for (const route of paths) {
    const url = new URL(route, origin);
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`${url.href}: HTTP ${response.status}`);
    }
    const excluded =
      response.headers.get("x-robots-tag")?.includes("noindex") ?? false;
    if (deployment === "preview" && !excluded) {
      throw new Error(`${url.href}: missing noindex header`);
    }
    if (deployment === "production" && excluded) {
      throw new Error(
        `${url.href}: production response is excluded from indexing`,
      );
    }
  }
  const pageUrl = new URL("/", origin);
  const page = await fetch(pageUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!page.ok) {
    throw new Error(`${pageUrl.href}: HTTP ${page.status}`);
  }
  checkPageUrls(await page.text(), pageUrl.href, origin);
  for (const route of ["/concepts"]) {
    const url = new URL(`${route}/`, origin);
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    const expected = new URL(route, origin).href;
    if (
      response.status !== 307 ||
      !location ||
      new URL(location, url).href !== expected
    ) {
      throw new Error(`${url.href}: expected HTTP 307 redirect to ${expected}`);
    }
  }
  console.log(`Checked ${site}: ${origin}`);
}

async function deploy(
  site: Site,
  branch: string,
  dryRun: boolean,
): Promise<void> {
  const deployment = deploymentForBranch(branch);
  const pullRequest = isPullRequestPreview(branch);
  if (dryRun && deployment === "preview") {
    throw new Error(
      "cf previews deploy has no dry run; Preview builds are validated with their schema",
    );
  }
  if (
    !dryRun &&
    (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)
  ) {
    throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
  }
  const root = path.resolve(import.meta.dirname, "../..");
  const directory = path.join(root, ".deploy", site);
  const { workers } = await readBuildOutput(directory);
  const require = createRequire(import.meta.url);
  const cli = path.join(
    path.dirname(require.resolve("cf/package.json")),
    "bin/cf",
  );
  const args = [
    ...(deployment === "preview"
      ? ["previews", "deploy", "--preview-name", branch]
      : ["deploy"]),
    "--prebuilt",
    "--mode",
    deployment,
    ...(dryRun ? ["--dry-run"] : []),
  ];
  const runCli = (args: string[], workingDirectory = directory) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], {
        cwd: workingDirectory,
        stdio: ["ignore", "pipe", "inherit"],
        env: {
          ...process.env,
          CF_SEND_TELEMETRY: "false",
        },
      });
      let stdout = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        process.stdout.write(chunk);
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`cf exited with code ${code}`));
        }
      });
    });
  // A pull request Preview must never become the Worker's first production deployment.
  if (
    !dryRun &&
    deployment === "preview" &&
    !pullRequest &&
    (await needsInitialDeployment(
      workers.default.config.name,
      process.env.CLOUDFLARE_ACCOUNT_ID!,
      process.env.CLOUDFLARE_API_TOKEN!,
    ))
  ) {
    const initial = await mkdtemp(
      path.join(os.tmpdir(), "lingui-for-sites-initial-"),
    );
    try {
      await writeInitialBuild(directory, initial);
      console.log(
        `Initializing ${site} without production routes for Preview Custom Domains`,
      );
      await runCli(["deploy", "--prebuilt", "--mode", deployment], initial);
    } finally {
      await rm(initial, { recursive: true, force: true });
    }
  }
  const output = await runCli(args);
  if (dryRun) {
    return;
  }
  const url =
    deployment === "preview"
      ? previewUrl(output, previewOrigin(site, branch))
      : new URL(sites[site].origin).href;
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `url=${url}\n${site}_url=${url}\n`,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const commit = process.env.PREVIEW_SHA ?? process.env.GITHUB_SHA ?? "local";
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `- ${site} (${deployment}): [${url}](${url}) — ${commit}\n`,
    );
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await checkSite(site, url, deployment);
      break;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      console.warn(`Waiting for deployment: ${String(error)}`);
      await setTimeout(5_000);
    }
  }
  console.log(`Verified ${site}: ${url}`);
}

if (import.meta.main) {
  const args = process.argv.slice(process.argv[2] === "--" ? 3 : 2);
  if (args[0] === "delete") {
    if (!isPullRequestPreview(args[2])) {
      throw new Error("Usage: deploy delete docs <pr-number>");
    }
    if (
      !process.env.CLOUDFLARE_ACCOUNT_ID ||
      !process.env.CLOUDFLARE_API_TOKEN
    ) {
      throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
    }
    await deletePreview(
      sites[parseSite(args[1])].worker,
      args[2]!,
      process.env.CLOUDFLARE_ACCOUNT_ID,
      process.env.CLOUDFLARE_API_TOKEN,
    );
  } else {
    if (
      args.length < 2 ||
      args.length > 3 ||
      (args[2] && args[2] !== "--dry-run")
    ) {
      throw new Error("Usage: deploy docs <main|stable|pr-number> [--dry-run]");
    }
    await deploy(parseSite(args[0]), args[1]!, args[2] === "--dry-run");
  }
}
