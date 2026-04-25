import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";

function cleanupHtml(html: string): string {
  return html
    .replaceAll(/\s*data-astro-source-file="[^"]+"/g, "")
    .replaceAll(/\s*data-astro-source-loc="[^"]+"/g, "");
}

describe.sequential.for(serverModes)(
  "%s Lingui Astro interpolation rendering",
  (mode) => {
    const server = new AppServer(mode);

    beforeAll(async () => {
      await server.start();
    }, 30_000);

    afterAll(async () => {
      await server.close();
    });

    test("renders translated messages around Astro interpolation comments and fragments", async () => {
      const response = await server.fetch("/interpolation?lang=en");
      const html = cleanupHtml(await response.text());

      expect(response.status).toBe(200);
      expect(html).toContain("Astro interpolation extraction checks");
      expect(html).toContain("Message before an HTML comment interpolation.");
      expect(html).toContain("Message after an HTML comment interpolation.");
      expect(html).toContain(
        "Message before a JavaScript comment interpolation.",
      );
      expect(html).toContain(
        "Message after a JavaScript comment interpolation.",
      );
      expect(html).toContain(
        "First translated node inside an Astro fragment interpolation.",
      );
      expect(html).toContain(
        "Second translated node inside an Astro fragment interpolation.",
      );
    });
  },
);
