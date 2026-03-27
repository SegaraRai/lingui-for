import { describe, expect, test } from "vite-plus/test";

import {
  extractAstroFixture,
  extractOfficialCore,
  extractOfficialReact,
  extractSvelteFixture,
  normalizeExtractedMessages,
} from "./support/extract.ts";
import { conformanceFixtures } from "./support/fixtures.ts";

describe.for(conformanceFixtures)("$name", (fixture) => {
  const extractReference = async () =>
    fixture.officialCore
      ? await extractOfficialCore(fixture.officialCore, fixture.name)
      : await extractOfficialReact(fixture.officialReact!, fixture.name);

  test("official core extraction", async () => {
    if (!fixture.officialCore) {
      return;
    }

    expect(
      await extractOfficialCore(fixture.officialCore, fixture.name),
    ).toMatchSnapshot();
  });

  test("official react extraction", async () => {
    if (!fixture.officialReact) {
      return;
    }

    expect(
      await extractOfficialReact(fixture.officialReact, fixture.name),
    ).toMatchSnapshot();
  });

  test("svelte extraction", async () => {
    if (!fixture.svelte) {
      return;
    }

    const extracted = await extractSvelteFixture(
      fixture.svelte,
      fixture.name,
      fixture.whitespace,
    );
    expect(extracted).toMatchSnapshot();

    const normalized = normalizeExtractedMessages(extracted);
    const reference = normalizeExtractedMessages(await extractReference());
    expect(normalized).toEqual(reference);
  });

  test("astro extraction", async () => {
    if (!fixture.astro) {
      return;
    }

    const extracted = await extractAstroFixture(
      fixture.astro,
      fixture.name,
      fixture.whitespace,
    );
    expect(extracted).toMatchSnapshot();

    const normalized = normalizeExtractedMessages(extracted);
    const reference = normalizeExtractedMessages(await extractReference());
    expect(normalized).toEqual(reference);
  });
});
