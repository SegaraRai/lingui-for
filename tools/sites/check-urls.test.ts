import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vite-plus/test";

import { checkBuiltUrls, checkPageUrls, siteUrl } from "./check-urls.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function page(origin: string): string {
  return `<link rel="canonical" href="${origin}/index.html">
    <meta property="og:url" content="${origin}/index.html">`;
}

test("the build URL defaults to production and must be an origin", () => {
  expect(siteUrl({})).toBe("https://lingui-for.roundtrip.dev/");
  expect(
    siteUrl({
      PUBLIC_SITE_URL: "https://pr-7.lingui-for-preview.roundtrip.dev",
    }),
  ).toBe("https://pr-7.lingui-for-preview.roundtrip.dev/");
  expect(() =>
    siteUrl({ PUBLIC_SITE_URL: "https://example.test/docs" }),
  ).toThrow("origin");
});

test("page metadata must belong to the build origin", () => {
  expect(() =>
    checkPageUrls(page("https://a.test"), "index.html", "https://a.test/"),
  ).not.toThrow();
  expect(() =>
    checkPageUrls(page("https://b.test"), "index.html", "https://a.test/"),
  ).toThrow("canonical");
  expect(() =>
    checkPageUrls(
      '<link rel="canonical" href="https://a.test/">',
      "index.html",
      "https://a.test/",
    ),
  ).toThrow("og:url");
});

test("sitemaps must list URLs of the build origin", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lingui-for-urls-"));
  roots.push(root);
  const dist = path.join(root, "apps/docs/dist");
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "index.html"), page("https://a.test"));
  await writeFile(path.join(dist, "ja.html"), page("https://a.test"));
  await writeFile(
    path.join(dist, "sitemap-0.xml"),
    "<urlset><url><loc>https://a.test/concepts</loc></url></urlset>",
  );
  await expect(
    checkBuiltUrls(root, "https://a.test/"),
  ).resolves.toBeUndefined();
  await writeFile(
    path.join(dist, "sitemap-0.xml"),
    "<urlset><url><loc>https://b.test/concepts</loc></url></urlset>",
  );
  await expect(checkBuiltUrls(root, "https://a.test/")).rejects.toThrow(
    "another origin",
  );
});
