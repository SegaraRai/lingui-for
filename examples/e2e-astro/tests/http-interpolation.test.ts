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
      expect(html).toContain(
        "Plain translated expression inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Single translated element root inside an Astro interpolation.",
      );
      expect(html).toContain(
        "First translated fragment child inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Second translated fragment child inside an Astro interpolation.",
      );
      expect(html).toContain(
        "First translated fragment child after an HTML comment inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Second translated fragment child after an HTML comment inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Message before a JavaScript comment interpolation.",
      );
      expect(html).toContain(
        "Message after a JavaScript comment interpolation.",
      );
      expect(html).toContain(
        "Message before an HTML comment-only interpolation.",
      );
      expect(html).toContain(
        "Message after an HTML comment-only interpolation.",
      );
      expect(html).toContain("Conditional HTML comment branches");
      expect(html).toContain(
        "Message after a selected HTML comment consequent branch.",
      );
      expect(html).toContain(
        "Translated alternate element after an unselected HTML comment consequent.",
      );
      expect(html).toContain(
        "Translated consequent element before an unselected HTML comment alternate.",
      );
      expect(html).toContain(
        "Translated alternate Trans branch after an unselected HTML comment consequent.",
      );
      expect(html).toContain(
        "Translated consequent Trans branch before an unselected HTML comment alternate.",
      );
      expect(html).toContain(
        "Message after a selected HTML comment alternate branch.",
      );
      expect(html).toContain(
        "Plain Trans component message on the interpolation page.",
      );
      expect(html).toContain(
        "Trans-wrapped plain expression outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped single root outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped first fragment child outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped second fragment child outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped first fragment child after an HTML comment outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped second fragment child after an HTML comment outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message before a JavaScript comment outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message after a JavaScript comment outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message before an HTML comment-only interpolation outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message after an HTML comment-only interpolation outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans alternate element after an unselected HTML comment consequent outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans consequent element before an unselected HTML comment alternate outside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans component rendered from inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped plain expression inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped single root inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped first fragment child inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped second fragment child inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped first fragment child after an HTML comment inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped second fragment child after an HTML comment inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message before a JavaScript comment inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message after a JavaScript comment inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message before an HTML comment-only interpolation inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans-wrapped message after an HTML comment-only interpolation inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans alternate element after an unselected HTML comment consequent inside an Astro interpolation.",
      );
      expect(html).toContain(
        "Trans consequent element before an unselected HTML comment alternate inside an Astro interpolation.",
      );
      expect(html.match(/\[object Object\]/g) ?? []).toHaveLength(0);
    });
  },
);
