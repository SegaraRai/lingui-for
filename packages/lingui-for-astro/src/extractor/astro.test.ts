import type { ExtractedMessage } from "@lingui/conf";
import dedent from "dedent";
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
    const source = dedent`
      ---
      import { Plural, select, selectOrdinal } from "lingui-for-astro/macro";

      const count = 0;
      const rank = 1;
      const role = "admin";
      ---

      <Plural
        value={count}
        _0={selectOrdinal(rank, {
          1: select(role, {
            admin: "component zero first admin",
            other: "component zero first other",
          }),
          2: select(role, {
            admin: "component zero second admin",
            other: "component zero second other",
          }),
          other: select(role, {
            admin: "component zero later admin",
            other: "component zero later other",
          }),
        })}
        _2={selectOrdinal(rank, {
          1: select(role, {
            admin: "component two first admin",
            other: "component two first other",
          }),
          2: select(role, {
            admin: "component two second admin",
            other: "component two second other",
          }),
          other: select(role, {
            admin: "component two later admin",
            other: "component two later other",
          }),
        })}
        other={selectOrdinal(rank, {
          1: select(role, {
            admin: "component many first admin",
            other: "component many first other",
          }),
          2: select(role, {
            admin: "component many second admin",
            other: "component many second other",
          }),
          other: select(role, {
            admin: "component many later admin",
            other: "component many later other",
          }),
        })}
      />
    `;
    const messages: ExtractedMessage[] = [];
    const filename = "/virtual/stress-origin.astro";

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
    ).toEqual([filename, 11, 16]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{rank, selectordinal, =1 {{role, select, admin {component two first admin} other {component two first other}}} =2 {{role, select, admin {component two second admin} other {component two second other}}} other {{role, select, admin {component two later admin} other {component two later other}}}}",
      )?.origin,
    ).toEqual([filename, 25, 14]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{rank, selectordinal, =1 {{role, select, admin {component many first admin} other {component many first other}}} =2 {{role, select, admin {component many second admin} other {component many second other}}} other {{role, select, admin {component many later admin} other {component many later other}}}}",
      )?.origin,
    ).toEqual([filename, 39, 12]);
  });

  test("keeps origins for core macro template expressions in Astro component markup", async () => {
    const source = dedent`
      ---
      import {
        Plural,
        plural,
        Select,
        select,
        SelectOrdinal,
        selectOrdinal,
        t,
      } from "lingui-for-astro/macro";
      ---

      <section>
        <h2>
          {
            t\`Astro runs plural, select, and selectOrdinal macros in component code.\`
          }
        </h2>

        <p>
          {
            plural(3, {
              one: "# Astro format sample",
              other: "# Astro format samples",
            })
          }
        </p>
        <p>
          {
            select("excited", {
              calm: "Astro select says calm.",
              excited: "Astro select says excited.",
              other: "Astro select says unknown.",
            })
          }
        </p>
        <p>
          {
            selectOrdinal(2, {
              one: "Astro finished #st.",
              two: "Astro finished #nd.",
              few: "Astro finished #rd.",
              other: "Astro finished #th.",
            })
          }
        </p>

        <Plural value={3} one="# Astro format sample" other="# Astro format samples" />
        <Select
          value="excited"
          _calm="Astro select says calm."
          _excited="Astro select says excited."
          other="Astro select says unknown."
        />
        <SelectOrdinal
          value={2}
          one="Astro finished #st."
          two="Astro finished #nd."
          few="Astro finished #rd."
          other="Astro finished #th."
        />
      </section>
    `;
    const messages: ExtractedMessage[] = [];
    const filename = "/virtual/astro-formats-origin.astro";

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
    ).toEqual([filename, 16, 6]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{0, plural, one {# Astro format sample} other {# Astro format samples}}",
      )?.origin,
    ).toEqual([filename, 22, 6]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{0, select, calm {Astro select says calm.} excited {Astro select says excited.} other {Astro select says unknown.}}",
      )?.origin,
    ).toEqual([filename, 30, 6]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "{0, selectordinal, one {Astro finished #st.} two {Astro finished #nd.} few {Astro finished #rd.} other {Astro finished #th.}}",
      )?.origin,
    ).toEqual([filename, 39, 6]);
  });

  test("keeps origins for multiline t template expressions in Astro component markup", async () => {
    const source = dedent`
      ---
      import { t } from "lingui-for-astro/macro";
      ---

      <div>
        <p>{t\`1. Increment one or more counters in Svelte or React.\`}</p>
        <p>
          {
            t\`2. Switch between English and Japanese in the header and watch the locale labels.\`
          }
        </p>
        <p>
          {
            t\`3. Open the paired route and compare which islands kept their counters, which updated their locale and page props, and which stayed frozen.\`
          }
        </p>
      </div>
    `;
    const messages: ExtractedMessage[] = [];
    const filename = "/virtual/transition-showcase-origin.astro";

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
    ).toEqual([filename, 9, 6]);

    expect(
      messages.find(
        (message) =>
          message.message ===
          "3. Open the paired route and compare which islands kept their counters, which updated their locale and page props, and which stayed frozen.",
      )?.origin,
    ).toEqual([filename, 14, 6]);
  });
});
