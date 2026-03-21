import type { ExtractedMessage } from "@lingui/conf";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";
import { astroExtractor } from "./astro.ts";

const linguiConfig = normalizeLinguiConfig();

describe("astroExtractor", () => {
  test("preserves original origins without query suffixes for indexed source maps", async () => {
    const source = `---
import { t } from "lingui-for-astro/macro";

const label = t\`Frontmatter origin message\`;
---

<p>{label}</p>
`;
    const messages: ExtractedMessage[] = [];

    await astroExtractor.extract(
      "/virtual/origin-check.astro",
      source,
      (message) => {
        messages.push(message);
      },
      { linguiConfig },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.origin).toEqual(["/virtual/origin-check.astro", 4, 14]);
  });

  test("preserves origins for nested extracted messages inside component macro ICU branches", async () => {
    const source = `---
import {
  Plural,
  select,
  selectOrdinal,
  Trans,
} from "lingui-for-astro/macro";

const count = 0;
const rank = 1;
const role = "admin";
---

<Trans>
  Before{" "}
  <strong>
    <Plural
      value={count}
      _0={selectOrdinal(rank, {
        1: select(role, {
          admin: "zero first admin",
          other: "zero first other",
        }),
        2: select(role, {
          admin: "zero second admin",
          other: "zero second other",
        }),
        other: select(role, {
          admin: "zero later admin",
          other: "zero later other",
        }),
      })}
      other="fallback"
    />
  </strong>{" "}
  after.
</Trans>
`;
    const messages: ExtractedMessage[] = [];

    await astroExtractor.extract(
      "/virtual/nested-origin.astro",
      source,
      (message) => {
        messages.push(message);
      },
      { linguiConfig },
    );

    const nested = messages.find(
      (message) =>
        message.message ===
        "{rank, selectordinal, =1 {{role, select, admin {zero first admin} other {zero first other}}} =2 {{role, select, admin {zero second admin} other {zero second other}}} other {{role, select, admin {zero later admin} other {zero later other}}}}",
    );

    expect(nested?.origin).toEqual(["/virtual/nested-origin.astro", 18, 6]);
  });

  test("preserves origins for deep component-macro ICU messages in stress page extraction", async () => {
    const source = readFileSync(
      new URL(
        "../../../../examples/e2e-astro/src/pages/stress.astro",
        import.meta.url,
      ),
      "utf8",
    );
    const messages: ExtractedMessage[] = [];
    const filename = "src/pages/stress.astro";

    await astroExtractor.extract(
      filename,
      source,
      (message) => {
        messages.push(message);
      },
      { linguiConfig },
    );

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{rank, selectordinal, =1 {{role, select, admin {component zero first admin} other {component zero first other}}} =2 {{role, select, admin {component zero second admin} other {component zero second other}}} other {{role, select, admin {component zero later admin} other {component zero later other}}}}",
      )?.origin,
    ).toEqual([filename, 134, 21]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{rank, selectordinal, =1 {{role, select, admin {component two first admin} other {component two first other}}} =2 {{role, select, admin {component two second admin} other {component two second other}}} other {{role, select, admin {component two later admin} other {component two later other}}}}",
      )?.origin,
    ).toEqual([filename, 148, 22]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{rank, selectordinal, =1 {{role, select, admin {component many first admin} other {component many first other}}} =2 {{role, select, admin {component many second admin} other {component many second other}}} other {{role, select, admin {component many later admin} other {component many later other}}}}",
      )?.origin,
    ).toEqual([filename, 162, 21]);
  });

  test("keeps origins for core macro template expressions in Astro component markup", async () => {
    const source = readFileSync(
      new URL(
        "../../../../examples/e2e-astro/src/components/astro/AstroFormats.astro",
        import.meta.url,
      ),
      "utf8",
    );
    const messages: ExtractedMessage[] = [];
    const filename = "src/components/astro/AstroFormats.astro";

    await astroExtractor.extract(
      filename,
      source,
      (message) => {
        messages.push(message);
      },
      { linguiConfig },
    );

    expect(
      messages.find(
        (message) =>
          message.message ===
          "Astro runs plural, select, and selectOrdinal macros in component code.",
      )?.origin,
    ).toEqual([filename, 20, 8]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{0, plural, one {# Astro format sample} other {# Astro format samples}}",
      )?.origin,
    ).toEqual([filename, 52, 8]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{0, select, calm {Astro select says calm.} excited {Astro select says excited.} other {Astro select says unknown.}}",
      )?.origin,
    ).toEqual([filename, 60, 8]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{0, selectordinal, one {Astro finished #st.} two {Astro finished #nd.} few {Astro finished #rd.} other {Astro finished #th.}}",
      )?.origin,
    ).toEqual([filename, 69, 8]);
  });

  test("keeps origins for multiline t template expressions in Astro component markup", async () => {
    const source = readFileSync(
      new URL(
        "../../../../examples/e2e-astro/src/components/TransitionShowcase.astro",
        import.meta.url,
      ),
      "utf8",
    );
    const messages: ExtractedMessage[] = [];
    const filename = "src/components/TransitionShowcase.astro";

    await astroExtractor.extract(
      filename,
      source,
      (message) => {
        messages.push(message);
      },
      { linguiConfig },
    );

    expect(
      messages.find(
        (message) =>
          message.message ===
          "2. Switch between English and Japanese in the header and watch the locale labels.",
      )?.origin,
    ).toEqual([filename, 53, 8]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "3. Open the paired route and compare which islands kept their counters, which updated their locale and page props, and which stayed frozen.",
      )?.origin,
    ).toEqual([filename, 58, 8]);
  });
});
