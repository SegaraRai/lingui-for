import { describe, expect, test } from "vite-plus/test";

import {
  extractAstroFixture,
  extractSvelteFixture,
} from "./support/extract.ts";
import { extractOriginFixtures } from "./support/origin-fixtures.ts";
import { findSourceLocation } from "./support/origin.ts";

function stripQuery(filename: string): string {
  const queryStart = filename.indexOf("?");
  return queryStart >= 0 ? filename.slice(0, queryStart) : filename;
}

describe("extract origin mapping", () => {
  describe.for(extractOriginFixtures)("$name", (fixture) => {
    const extractMessages = async () =>
      fixture.framework === "svelte"
        ? await extractSvelteFixture(fixture.source, fixture.filename)
        : await extractAstroFixture(fixture.source, fixture.filename);

    test("uses original source filename and positions for extracted origins", async () => {
      const extracted = await extractMessages();

      for (const expectation of fixture.expectations) {
        const message = extracted.find(
          (candidate) => candidate.message === expectation.message,
        );

        expect(
          message,
          `missing message: ${expectation.message}`,
        ).toBeDefined();
        expect(message?.origin).toBeDefined();

        const expected = findSourceLocation(fixture.source, expectation.needle);
        expect(message?.origin?.[0]).toBe(stripQuery(fixture.filename));
        expect(message?.origin?.[1]).toBe(expected.line);
        expect(message?.origin?.[2]).toBe(
          expectation.column ?? expected.column,
        );
      }
    });
  });
});
