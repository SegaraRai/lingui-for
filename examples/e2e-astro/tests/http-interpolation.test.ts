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
      const expectedSubstrings = [
        "Astro interpolation extraction checks",
        "Plain translated expression inside an Astro interpolation.",
        "Single translated element root inside an Astro interpolation.",
        "First translated fragment child inside an Astro interpolation.",
        "Second translated fragment child inside an Astro interpolation.",
        "First translated fragment child after an HTML comment inside an Astro interpolation.",
        "Second translated fragment child after an HTML comment inside an Astro interpolation.",
        "Message before a JavaScript comment interpolation.",
        "Message after a JavaScript comment interpolation.",
        "Message before an HTML comment-only interpolation.",
        "Message after an HTML comment-only interpolation.",
        "Conditional HTML comment branches",
        "Message after a selected HTML comment consequent branch.",
        "Translated alternate element after an unselected HTML comment consequent.",
        "Translated consequent element before an unselected HTML comment alternate.",
        "Translated alternate Trans branch after an unselected HTML comment consequent.",
        "Translated consequent Trans branch before an unselected HTML comment alternate.",
        "Message after a selected HTML comment alternate branch.",
        "Plain Trans component message on the interpolation page.",
        "Trans-wrapped plain expression outside an Astro interpolation.",
        "Trans-wrapped single root outside an Astro interpolation.",
        "Trans-wrapped first fragment child outside an Astro interpolation.",
        "Trans-wrapped second fragment child outside an Astro interpolation.",
        "Trans-wrapped first fragment child after an HTML comment outside an Astro interpolation.",
        "Trans-wrapped second fragment child after an HTML comment outside an Astro interpolation.",
        "Trans-wrapped message before a JavaScript comment outside an Astro interpolation.",
        "Trans-wrapped message after a JavaScript comment outside an Astro interpolation.",
        "Trans-wrapped message before an HTML comment-only interpolation outside an Astro interpolation.",
        "Trans-wrapped message after an HTML comment-only interpolation outside an Astro interpolation.",
        "Trans alternate element after an unselected HTML comment consequent outside an Astro interpolation.",
        "Trans consequent element before an unselected HTML comment alternate outside an Astro interpolation.",
        "Trans component rendered from inside an Astro interpolation.",
        "Trans-wrapped plain expression inside an Astro interpolation.",
        "Trans-wrapped single root inside an Astro interpolation.",
        "Trans-wrapped first fragment child inside an Astro interpolation.",
        "Trans-wrapped second fragment child inside an Astro interpolation.",
        "Trans-wrapped first fragment child after an HTML comment inside an Astro interpolation.",
        "Trans-wrapped second fragment child after an HTML comment inside an Astro interpolation.",
        "Trans-wrapped message before a JavaScript comment inside an Astro interpolation.",
        "Trans-wrapped message after a JavaScript comment inside an Astro interpolation.",
        "Trans-wrapped message before an HTML comment-only interpolation inside an Astro interpolation.",
        "Trans-wrapped message after an HTML comment-only interpolation inside an Astro interpolation.",
        "Trans alternate element after an unselected HTML comment consequent inside an Astro interpolation.",
        "Trans consequent element before an unselected HTML comment alternate inside an Astro interpolation.",
      ];

      for (const expected of expectedSubstrings) {
        expect(html, `missing: ${expected}`).toContain(expected);
      }
      expect(html.match(/\[object Object\]/g) ?? []).toHaveLength(0);
    });
  },
);
