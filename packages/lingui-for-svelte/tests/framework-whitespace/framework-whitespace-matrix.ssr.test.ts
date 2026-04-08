import { render } from "svelte/server";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { frameworkWhitespaceCases } from "./generated/cases.ts";
import MatrixHarness from "./generated/MatrixHarness.svelte";

function normalizeSsrBody(body: string): string {
  return body.replaceAll(/<!--[\w[\]-]*-->/g, "");
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

  beforeAll(() => {
    renderedHtml = normalizeSsrBody(render(MatrixHarness).body);
  });

  test.each(frameworkWhitespaceCases)(
    "captures Svelte inter-node whitespace behavior for %s",
    (caseId) => {
      expect(extractCaseMarkup(renderedHtml, caseId)).toMatchSnapshot();
    },
  );
});
