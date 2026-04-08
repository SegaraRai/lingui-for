import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { frameworkWhitespaceCases } from "./generated/cases.ts";
import MatrixHarness from "./generated/MatrixHarness.astro";

function normalizeSsrBody(html: string): string {
  return html
    .replaceAll(/\s*data-astro-source-file="[^"]+"/g, "")
    .replaceAll(/\s*data-astro-source-loc="[^"]+"/g, "");
}

function extractCaseMarkup(html: string, caseId: string): string {
  const openTag = `<whitespace-case data-case="${caseId}">`;
  const start = html.indexOf(openTag);
  if (start === -1) {
    throw new Error(`Could not find case ${caseId}`);
  }

  const end = html.indexOf("</whitespace-case>", start);
  if (end === -1) {
    throw new Error(`Could not find closing tag for case ${caseId}`);
  }

  return html.slice(start, end + "</whitespace-case>".length);
}

describe("framework whitespace SSR", () => {
  let renderedHtml = "";

  beforeAll(async () => {
    const container = await AstroContainer.create();
    renderedHtml = normalizeSsrBody(
      await container.renderToString(MatrixHarness),
    );
  });

  test.each(frameworkWhitespaceCases)(
    "captures Astro inter-node whitespace behavior for %s",
    (caseId) => {
      expect(extractCaseMarkup(renderedHtml, caseId)).toMatchSnapshot();
    },
  );
});
