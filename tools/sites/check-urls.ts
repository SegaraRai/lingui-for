import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { sites } from "./prepare.ts";

/**
 * Returns the origin that the docs build uses for metadata and sitemaps. `PUBLIC_SITE_URL`
 * selects it, and the production origin is the default. Rejects credentials, paths, queries, and
 * fragments.
 */
export function siteUrl(environment: NodeJS.ProcessEnv): string {
  const url = new URL(environment.PUBLIC_SITE_URL ?? `${sites.docs.origin}/`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("docs: the build URL must be an HTTP(S) origin");
  }
  return url.href;
}

/**
 * Checks that the canonical and Open Graph URLs of a rendered page belong to `origin`.
 * Throws on a missing URL or a URL on another origin.
 */
export function checkPageUrls(
  html: string,
  file: string,
  origin: string,
): void {
  const values = new Map<string, string>();
  for (const [tag] of html.matchAll(/<(?:meta|link)\b[^>]*>/g)) {
    const attributes = new Map(
      [...tag.matchAll(/\s([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [
        name!,
        value!,
      ]),
    );
    if (attributes.get("rel") === "canonical") {
      values.set("canonical", attributes.get("href") ?? "");
    } else {
      const name = attributes.get("property") ?? attributes.get("name");
      if (name) {
        values.set(name, attributes.get("content") ?? "");
      }
    }
  }
  const expected = new URL(origin).origin;
  for (const name of ["canonical", "og:url"]) {
    const value = values.get(name);
    if (!value || new URL(value).origin !== expected) {
      throw new Error(
        `${file}: ${name} must belong to ${expected}, received ${value}`,
      );
    }
  }
}

/**
 * Checks the rendered metadata and sitemaps of the docs build against the build origin.
 */
export async function checkBuiltUrls(
  root: string,
  origin: string,
): Promise<void> {
  const directory = path.resolve(root, sites.docs.source);
  const files = await readdir(directory);
  for (const file of ["index.html", "ja.html"]) {
    checkPageUrls(
      await readFile(path.join(directory, file), "utf8"),
      file,
      origin,
    );
  }
  const expected = new URL(origin).origin;
  const sitemaps = files.filter((file) => /^sitemap.*\.xml$/.test(file));
  if (sitemaps.length === 0) {
    throw new Error("docs: the build has no sitemap");
  }
  for (const file of sitemaps) {
    const xml = await readFile(path.join(directory, file), "utf8");
    for (const [, location] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (new URL(location!).origin !== expected) {
        throw new Error(
          `${file}: sitemap URL belongs to another origin: ${location}`,
        );
      }
    }
  }
  console.log(`Verified build URLs: ${origin}`);
}

if (import.meta.main) {
  await checkBuiltUrls(
    path.resolve(import.meta.dirname, "../.."),
    siteUrl(process.env),
  );
}
