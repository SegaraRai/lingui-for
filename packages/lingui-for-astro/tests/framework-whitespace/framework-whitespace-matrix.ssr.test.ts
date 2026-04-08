import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, test } from "vite-plus/test";

import { frameworkWhitespaceCases } from "./generated/cases";
import MatrixHarness from "./generated/MatrixHarness.astro";

function normalizeAstroSsrBody(html: string): string {
  return html
    .replaceAll(/\s*data-astro-source-file="[^"]+"/g, "")
    .replaceAll(/\s*data-astro-source-loc="[^"]+"/g, "");
}

function extractCaseMarkup(html: string, caseId: string): string {
  const openTagMatch = new RegExp(
    `<whitespace-case\\b[^>]*\\bdata-case="${caseId}"[^>]*>`,
  ).exec(html);

  if (!openTagMatch || openTagMatch.index === undefined) {
    throw new Error(`Could not find case ${caseId}`);
  }

  const start = openTagMatch.index;
  const end = html.indexOf("</whitespace-case>", start);

  if (end === -1) {
    throw new Error(`Could not find closing tag for case ${caseId}`);
  }

  return html.slice(start, end + "</whitespace-case>".length);
}

describe("framework whitespace SSR", () => {
  test.each(frameworkWhitespaceCases)(
    "captures Astro inter-node whitespace behavior for %s",
    async (caseId) => {
      const container = await AstroContainer.create();
      const html = await container.renderToString(MatrixHarness);

      expect(
        extractCaseMarkup(normalizeAstroSsrBody(html), caseId),
      ).toMatchSnapshot();
    },
  );
});
