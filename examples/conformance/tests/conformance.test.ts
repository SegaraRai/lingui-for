import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { conformanceFixtures } from "./support/fixtures.ts";
import {
  extractIds,
  extractMessages,
  transformAstroFixture,
  transformOfficialCore,
  transformOfficialReact,
  transformSvelteFixture,
} from "./support/transforms.ts";

describe.for(["development", "production"])("NODE_ENV=%s", (envValue) => {
  const originalEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = envValue;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe.for(conformanceFixtures)("$name", (fixture) => {
    const getReference = () =>
      fixture.officialCore
        ? transformOfficialCore(fixture.officialCore)
        : transformOfficialReact(fixture.officialReact!);

    test("official core transform", () => {
      if (!fixture.officialCore) {
        return;
      }

      expect(transformOfficialCore(fixture.officialCore)).toMatchSnapshot();
    });

    test("official react transform", () => {
      if (!fixture.officialReact) {
        return;
      }

      expect(transformOfficialReact(fixture.officialReact)).toMatchSnapshot();
    });

    test("svelte transform", async () => {
      if (!fixture.svelte) {
        return;
      }

      const transformed = await transformSvelteFixture(fixture.svelte);
      expect(transformed).toMatchSnapshot();

      const reference = getReference();

      const transformedIds = extractIds(transformed);
      const referenceIds = extractIds(reference);
      expect(transformedIds).toEqual(referenceIds);

      const transformedMessages = extractMessages(transformed);
      const referenceMessages = extractMessages(reference);
      expect(transformedMessages).toEqual(referenceMessages);
    });

    test("astro transform", async () => {
      if (!fixture.astro) {
        return;
      }

      const transformed = await transformAstroFixture(fixture.astro);
      expect(transformed).toMatchSnapshot();

      const reference = getReference();

      const transformedIds = extractIds(transformed);
      const referenceIds = extractIds(reference);
      expect(transformedIds).toEqual(referenceIds);

      const transformedMessages = extractMessages(transformed);
      const referenceMessages = extractMessages(reference);
      expect(transformedMessages).toEqual(referenceMessages);
    });
  });
});
