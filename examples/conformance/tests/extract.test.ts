import { describe, expect, test } from "vite-plus/test";

import { conformanceFixtures } from "./support/fixtures.ts";
import {
  extractAstroFixture,
  extractOfficialReference,
  extractSvelteFixture,
  normalizeExtractedMessages,
} from "./support/extract.ts";

const knownReferenceMismatches = new Set<string>();

describe.for(conformanceFixtures)("$name", (fixture) => {
  const extractReference = async () =>
    fixture.officialCore
      ? await extractOfficialReference(
          fixture.officialCore,
          "core",
          fixture.name,
        )
      : await extractOfficialReference(
          fixture.officialReact!,
          "react",
          fixture.name,
        );

  test("official core extraction", async () => {
    if (!fixture.officialCore) {
      return;
    }

    expect(
      await extractOfficialReference(
        fixture.officialCore,
        "core",
        fixture.name,
      ),
    ).toMatchSnapshot();
  });

  test("official react extraction", async () => {
    if (!fixture.officialReact) {
      return;
    }

    expect(
      await extractOfficialReference(
        fixture.officialReact,
        "react",
        fixture.name,
      ),
    ).toMatchSnapshot();
  });

  test("svelte extraction", async () => {
    if (!fixture.svelte) {
      return;
    }

    const extracted = await extractSvelteFixture(fixture.svelte, fixture.name);
    expect(extracted).toMatchSnapshot();

    const normalized = normalizeExtractedMessages(extracted);
    const reference = normalizeExtractedMessages(await extractReference());
    expect(normalized).toEqual(reference);
  });

  const astroTest = knownReferenceMismatches.has(`astro:${fixture.name}`)
    ? test.fails
    : test;

  astroTest("astro extraction", async () => {
    if (!fixture.astro) {
      return;
    }

    const extracted = await extractAstroFixture(fixture.astro, fixture.name);
    expect(extracted).toMatchSnapshot();

    const normalized = normalizeExtractedMessages(extracted);
    const reference = normalizeExtractedMessages(await extractReference());
    expect(normalized).toEqual(reference);
  });
});
