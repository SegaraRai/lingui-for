import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "../support/app-server.ts";

function cleanupHtml(html: string): string {
  return html
    .replaceAll(/\s*data-astro-source-file="[^"]+"/g, "")
    .replaceAll(/\s*data-astro-source-loc="[^"]+"/g, "");
}

describe.sequential.for(serverModes)(
  "%s framework interpolation behavior",
  (mode) => {
    const server = new AppServer(mode);

    beforeAll(async () => {
      await server.start();
    }, 30_000);

    afterAll(async () => {
      await server.close();
    });

    test("renders supported Astro interpolation forms", async () => {
      const response = await server.fetch("/framework/interpolation");
      const html = cleanupHtml(await response.text());

      expect(response.status).toBe(200);
      expect(html).toContain("Astro interpolation behavior checks");
      expect(html).toContain(
        "Allowed: a JavaScript expression can produce text.",
      );
      expect(html).toContain(
        "Allowed: an interpolation can render one element root.",
      );
      expect(html).toContain(
        "Allowed: an HTML comment can be the whole interpolation.",
      );
      expect(html).toContain(
        "Allowed: a JavaScript block comment can be the whole interpolation.",
      );
      expect(html).toContain("Allowed: first node inside fragment.");
      expect(html).toContain("Allowed: second node inside fragment.");
      expect(html).toContain(
        "Allowed: first node after a comment inside fragment.",
      );
      expect(html).toContain(
        "Allowed: second node after a comment inside fragment.",
      );
      expect(html).toContain(
        "Allowed: an HTML comment can be the true branch.",
      );
      expect(html).toContain(
        "Allowed: an HTML comment can be the false branch.",
      );
      expect(html).toContain("element right branch rendered");
      expect(html).toContain(
        "Allowed: the alternate branch can render a single element root.",
      );
      expect(html).not.toContain("unexpected left");
      expect(html).not.toContain("unexpected right");
    });
  },
);
