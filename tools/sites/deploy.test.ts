import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  checkSite,
  deletePreview,
  deploymentForBranch,
  needsInitialDeployment,
  previewUrl,
} from "./deploy.ts";

afterEach(() => vi.unstubAllGlobals());

test.each([
  { deployments: [], initialize: true },
  {
    deployments: [{ id: "existing-production-deployment" }],
    initialize: false,
  },
])(
  "checks whether the Worker needs its first deployment: %j",
  async ({ deployments, initialize }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, result: { deployments } }),
      ),
    );
    await expect(
      needsInitialDeployment("lingui-for-docs", "account", "token"),
    ).resolves.toBe(initialize);
  },
);

test("refuses to initialize when deployment history cannot be confirmed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ success: false }, { status: 403 })),
  );
  await expect(
    needsInitialDeployment("lingui-for-docs", "account", "token"),
  ).rejects.toThrow("HTTP 403");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ success: true, result: {} })),
  );
  await expect(
    needsInitialDeployment("lingui-for-docs", "account", "token"),
  ).rejects.toThrow("no deployment history");
});

test("initializes a missing Worker only when Cloudflare confirms that it does not exist", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { success: false, errors: [{ code: 10007 }] },
        { status: 404 },
      ),
    ),
  );
  await expect(
    needsInitialDeployment("lingui-for-docs", "account", "token"),
  ).resolves.toBe(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ success: false }, { status: 404 })),
  );
  await expect(
    needsInitialDeployment("lingui-for-docs", "account", "token"),
  ).rejects.toThrow("HTTP 404");
});

test("routes main and pull request Previews to Preview and stable to production", () => {
  expect(deploymentForBranch("main")).toBe("preview");
  expect(deploymentForBranch("pr-123")).toBe("preview");
  expect(deploymentForBranch("stable")).toBe("production");
  expect(() => deploymentForBranch("feature/test")).toThrow("main or stable");
  expect(() => deploymentForBranch("pr-0")).toThrow("main or stable");
});

test("treats a missing Preview as deleted and reports other failures", async () => {
  const request = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", request);
  await expect(
    deletePreview("lingui-for-docs", "pr-123", "account", "token"),
  ).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledWith(
    "https://api.cloudflare.com/client/v4/accounts/account/workers/workers/lingui-for-docs/previews/pr-123",
    expect.objectContaining({ method: "DELETE" }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 403 })),
  );
  await expect(
    deletePreview("lingui-for-docs", "pr-123", "account", "token"),
  ).rejects.toThrow("HTTP 403");
});

test("selects the configured origin when cf returns multiple Preview domains", () => {
  expect(
    previewUrl(
      JSON.stringify(
        {
          type: "preview",
          preview_urls: [
            "https://main-lingui-for-docs.example.workers.dev",
            "https://main.lingui-for-preview.roundtrip.dev",
          ],
          deployment_urls: ["https://123-lingui-for-docs.example.workers.dev"],
        },
        null,
        2,
      ),
      "https://main.lingui-for-preview.roundtrip.dev/",
    ),
  ).toBe("https://main.lingui-for-preview.roundtrip.dev/");
  expect(() =>
    previewUrl(
      '{"type":"preview","preview_urls":[]}',
      "https://main.lingui-for-preview.roundtrip.dev/",
    ),
  ).toThrow("Preview URL");
  expect(() =>
    previewUrl(
      '{"type":"preview","preview_urls":["https://other.example/"]}',
      "https://main.lingui-for-preview.roundtrip.dev/",
    ),
  ).toThrow("Preview URL");
  expect(() =>
    previewUrl(
      '{"type":"preview","preview_urls":["http://main.lingui-for-preview.roundtrip.dev/"]}',
      "http://main.lingui-for-preview.roundtrip.dev/",
    ),
  ).toThrow("HTTPS");
});

function docsResponse(
  url: URL,
  init: RequestInit,
  headers: Record<string, string>,
  canonicalOrigin = url.origin,
): Response {
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    return new Response(null, {
      status: 307,
      headers: { Location: url.pathname.slice(0, -1) },
    });
  }
  return new Response(
    init.method === "HEAD"
      ? null
      : `<link rel="canonical" href="${canonicalOrigin}/index.html">
        <meta property="og:url" content="${canonicalOrigin}/index.html">`,
    { headers },
  );
}

test.each([
  { deployment: "preview", noindex: true, error: undefined },
  { deployment: "preview", noindex: false, error: "noindex" },
  { deployment: "production", noindex: false, error: undefined },
  { deployment: "production", noindex: true, error: "indexing" },
] as const)(
  "checks the indexing policy of each deployment: %j",
  async ({ deployment, noindex, error }) => {
    const request = vi.fn(async (url: URL, init: RequestInit) =>
      docsResponse(url, init, noindex ? { "X-Robots-Tag": "noindex" } : {}),
    );
    vi.stubGlobal("fetch", request);
    const check = checkSite("docs", "https://docs.example", deployment);
    if (error) {
      await expect(check).rejects.toThrow(error);
    } else {
      await expect(check).resolves.toBeUndefined();
      for (const [, init] of request.mock.calls) {
        expect(init.redirect).toBe("manual");
      }
    }
  },
);

test("rejects metadata that points to another deployment", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) =>
      docsResponse(url, init, {}, "https://lingui-for.roundtrip.dev"),
    ),
  );
  await expect(
    checkSite(
      "docs",
      "https://main.lingui-for-preview.roundtrip.dev/",
      "production",
    ),
  ).rejects.toThrow("canonical");
});

test.each([
  { status: 200, location: undefined },
  { status: 307, location: "/concepts/" },
])("requires slashless document URLs: %j", async ({ status, location }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      if (url.pathname === "/concepts/") {
        return new Response(null, {
          status,
          headers: location ? { Location: location } : {},
        });
      }
      return docsResponse(url, init, {});
    }),
  );
  await expect(
    checkSite("docs", "https://lingui-for.roundtrip.dev", "production"),
  ).rejects.toThrow("redirect");
});
