import dedent from "dedent";

export type ConformanceFixture =
  | {
      name: string;
      whitespace?: "auto" | "jsx";
      officialCore: string;
      officialReact?: string;
      astro?: string;
      svelte?: string;
    }
  | {
      name: string;
      whitespace?: "auto" | "jsx";
      officialCore?: string;
      officialReact: string;
      astro?: string;
      svelte?: string;
    };

export const conformanceFixtures: readonly ConformanceFixture[] = [
  {
    name: "rich-text-trans",
    officialReact: dedent`
      import { Trans } from "@lingui/react/macro";

      export function Example({ name }: { name: string }) {
        return <Trans>Hello <strong>{name}</strong>.</Trans>;
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";

        let name = $state("Ada");
      </script>

      <Trans>Hello <strong>{name}</strong>.</Trans>
    `,
    astro: dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";

      const name = "Ada";
      ---

      <Trans>Hello <strong>{name}</strong>.</Trans>
    `,
  },
  {
    name: "deep-rich-text-trans",
    officialReact: dedent`
      import { Trans } from "@lingui/react/macro";

      export function Example({
        action,
        count,
        name,
      }: {
        action: string;
        count: number;
        name: string;
      }) {
        return (
          <Trans>
            Read <strong><em>{name}</em></strong> before opening{" "}
            <code>{count}</code> tabs to {action}.
          </Trans>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";

        let action = $state("deploy");
        let count = $state(3);
        let name = $state("Ada");
      </script>

      <Trans>
        Read <strong><em>{name}</em></strong> before opening{" "}
        <code>{count}</code> tabs to {action}.
      </Trans>
    `,
    astro: dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";

      const action = "deploy";
      const count = 3;
      const name = "Ada";
      ---

      <Trans>
        Read <strong><em>{name}</em></strong> before opening{" "}
        <code>{count}</code> tabs to {action}.
      </Trans>
    `,
  },
  {
    name: "nested-icu-core",
    officialCore: dedent`
      import { plural, select, selectOrdinal, t } from "@lingui/core/macro";

      export const message = t({
        message: plural(count, {
          0: selectOrdinal(rank, {
            1: select(role, {
              admin: "core zero first admin",
              other: "core zero first other",
            }),
            other: select(role, {
              admin: "core zero later admin",
              other: "core zero later other",
            }),
          }),
          other: selectOrdinal(rank, {
            1: select(role, {
              admin: "core many first admin",
              other: "core many first other",
            }),
            other: select(role, {
              admin: "core many later admin",
              other: "core many later other",
            }),
          }),
        }),
      });
    `,
    svelte: dedent`
      <script lang="ts">
        import { plural, select, selectOrdinal, t } from "lingui-for-svelte/macro";

        let count = $state(0);
        let rank = $state(1);
        let role = $state("admin");

        const deepCore = $derived($t({
          message: plural(count, {
            0: selectOrdinal(rank, {
              1: select(role, {
                admin: "core zero first admin",
                other: "core zero first other",
              }),
              other: select(role, {
                admin: "core zero later admin",
                other: "core zero later other",
              }),
            }),
            other: selectOrdinal(rank, {
              1: select(role, {
                admin: "core many first admin",
                other: "core many first other",
              }),
              other: select(role, {
                admin: "core many later admin",
                other: "core many later other",
              }),
            }),
          }),
        }));
      </script>

      <p>{deepCore}</p>
    `,
    astro: dedent`
      ---
      import { plural, select, selectOrdinal, t } from "lingui-for-astro/macro";

      const count = 0;
      const rank = 1;
      const role = "admin";
      const deepCore = t({
        message: plural(count, {
          0: selectOrdinal(rank, {
            1: select(role, {
              admin: "core zero first admin",
              other: "core zero first other",
            }),
            other: select(role, {
              admin: "core zero later admin",
              other: "core zero later other",
            }),
          }),
          other: selectOrdinal(rank, {
            1: select(role, {
              admin: "core many first admin",
              other: "core many first other",
            }),
            other: select(role, {
              admin: "core many later admin",
              other: "core many later other",
            }),
          }),
        }),
      });
      ---

      <p>{deepCore}</p>
    `,
  },
  {
    name: "exact-number-component",
    officialReact: dedent`
      import { Plural, SelectOrdinal } from "@lingui/react/macro";

      export function Example({ count, rank }: { count: number; rank: number }) {
        return (
          <>
            <Plural
              value={count}
              _0="no queued builds"
              _2="exactly two queued builds"
              other="# queued builds"
            />
            <SelectOrdinal
              value={rank}
              _1="take the shortcut"
              _2="take the scenic route"
              other="finish in #th place"
            />
          </>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Plural, SelectOrdinal } from "lingui-for-svelte/macro";

        let count = $state(2);
        let rank = $state(1);
      </script>

      <Plural
        value={count}
        _0="no queued builds"
        _2="exactly two queued builds"
        other="# queued builds"
      />
      <SelectOrdinal
        value={rank}
        _1="take the shortcut"
        _2="take the scenic route"
        other="finish in #th place"
      />
    `,
    astro: dedent`
      ---
      import { Plural, SelectOrdinal } from "lingui-for-astro/macro";

      const count = 2;
      const rank = 1;
      ---

      <Plural
        value={count}
        _0="no queued builds"
        _2="exactly two queued builds"
        other="# queued builds"
      />
      <SelectOrdinal
        value={rank}
        _1="take the shortcut"
        _2="take the scenic route"
        other="finish in #th place"
      />
    `,
  },
  {
    name: "trans-with-plural",
    officialReact: dedent`
      import { Plural, Trans } from "@lingui/react/macro";

      export function Example({ count }: { count: number }) {
        return (
          <Trans>
            You have{" "}
            <strong>
              <Plural
                value={count}
                _0="no unread messages"
                one="# unread message"
                other="# unread messages"
              />
            </strong>.
          </Trans>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Plural, Trans } from "lingui-for-svelte/macro";

        let count = $state(0);
      </script>

      <Trans>
        You have{" "}
        <strong>
          <Plural
            value={count}
            _0="no unread messages"
            one="# unread message"
            other="# unread messages"
          />
        </strong>.
      </Trans>
    `,
    astro: dedent`
      ---
      import { Plural, Trans } from "lingui-for-astro/macro";

      const count = 0;
      ---

      <Trans>
        You have{" "}
        <strong>
          <Plural
            value={count}
            _0="no unread messages"
            one="# unread message"
            other="# unread messages"
          />
        </strong>.
      </Trans>
    `,
  },
  {
    name: "trans-with-deeply-nested-component-icu",
    officialReact: dedent`
      import { select, selectOrdinal } from "@lingui/core/macro";
      import { Plural, Trans } from "@lingui/react/macro";

      export function Example({
        count,
        rank,
        role,
      }: {
        count: number;
        rank: number;
        role: string;
      }) {
        return (
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
                _2={selectOrdinal(rank, {
                  1: select(role, {
                    admin: "two first admin",
                    other: "two first other",
                  }),
                  2: select(role, {
                    admin: "two second admin",
                    other: "two second other",
                  }),
                  other: select(role, {
                    admin: "two later admin",
                    other: "two later other",
                  }),
                })}
                other={selectOrdinal(rank, {
                  1: select(role, {
                    admin: "many first admin",
                    other: "many first other",
                  }),
                  2: select(role, {
                    admin: "many second admin",
                    other: "many second other",
                  }),
                  other: select(role, {
                    admin: "many later admin",
                    other: "many later other",
                  }),
                })}
              />
            </strong>{" "}
            after.
          </Trans>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import {
          Plural,
          select,
          selectOrdinal,
          Trans,
        } from "lingui-for-svelte/macro";

        let count = $state(0);
        let rank = $state(1);
        let role = $state("admin");
      </script>

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
            _2={selectOrdinal(rank, {
              1: select(role, {
                admin: "two first admin",
                other: "two first other",
              }),
              2: select(role, {
                admin: "two second admin",
                other: "two second other",
              }),
              other: select(role, {
                admin: "two later admin",
                other: "two later other",
              }),
            })}
            other={selectOrdinal(rank, {
              1: select(role, {
                admin: "many first admin",
                other: "many first other",
              }),
              2: select(role, {
                admin: "many second admin",
                other: "many second other",
              }),
              other: select(role, {
                admin: "many later admin",
                other: "many later other",
              }),
            })}
          />
        </strong>{" "}
        after.
      </Trans>
    `,
    astro: dedent`
      ---
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
            _2={selectOrdinal(rank, {
              1: select(role, {
                admin: "two first admin",
                other: "two first other",
              }),
              2: select(role, {
                admin: "two second admin",
                other: "two second other",
              }),
              other: select(role, {
                admin: "two later admin",
                other: "two later other",
              }),
            })}
            other={selectOrdinal(rank, {
              1: select(role, {
                admin: "many first admin",
                other: "many first other",
              }),
              2: select(role, {
                admin: "many second admin",
                other: "many second other",
              }),
              other: select(role, {
                admin: "many later admin",
                other: "many later other",
              }),
            })}
          />
        </strong>{" "}
        after.
      </Trans>
    `,
  },
  {
    name: "with-id-context-comment-core",
    officialCore: dedent`
      import { t } from "@lingui/core/macro";

      const value = "foo";

      const v1a = t\`Message with interpolation: \${value}\`;
      const v1b = t({
        message: \`Message with interpolation: \${value}\`,
      });
      const v2 = t({
        id: "with-interpolation-with-id",
        message: \`Message with interpolation: \${value}\`,
      });
      const v3 = t({
        context: "This is a context",
        message: \`Message with interpolation: \${value}\`,
      });
      const v4 = t({
        comment: "This is a comment",
        message: \`Message with interpolation: \${value}\`,
      });

      const p1a = t\`Message without interpolation\`;
      const p1b = t({
        message: "Message without interpolation",
      });
      const p2 = t({
        id: "no-interpolation-with-id",
        message: "Message without interpolation",
      });
      const p3 = t({
        context: "This is a context",
        message: "Message without interpolation",
      });
      const p4 = t({
        comment: "This is a comment",
        message: "Message without interpolation",
      });
    `,
    svelte: dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        const value = $state("foo");
      </script>

      <p id="v1a">{$t\`Message with interpolation: \${value}\`}</p>
      <p id="v1b">{$t({
        message: \`Message with interpolation: \${value}\`,
      })}</p>
      <p id="v2">{$t({
        id: "with-interpolation-with-id",
        message: \`Message with interpolation: \${value}\`,
      })}</p>
      <p id="v3">{$t({
        context: "This is a context",
        message: \`Message with interpolation: \${value}\`,
      })}</p>
      <p id="v4">{$t({
        comment: "This is a comment",
        message: \`Message with interpolation: \${value}\`,
      })}</p>

      <p id="p1a">{$t\`Message without interpolation\`}</p>
      <p id="p1b">{$t({
        message: "Message without interpolation",
      })}</p>
      <p id="p2">{$t({
        id: "no-interpolation-with-id",
        message: "Message without interpolation",
      })}</p>
      <p id="p3">{$t({
        context: "This is a context",
        message: "Message without interpolation",
      })}</p>
      <p id="p4">{$t({
        comment: "This is a comment",
        message: "Message without interpolation",
      })}</p>
    `,
    astro: dedent`
      ---
      import { t } from "lingui-for-astro/macro";

      const value = "foo";
      ---

      <p id="v1a">{t\`Message with interpolation: \${value}\`}</p>
      <p id="v1b">{t({
        message: \`Message with interpolation: \${value}\`,
      })}</p>
      <p id="v2">{t({
        id: "with-interpolation-with-id",
        message: \`Message with interpolation: \${value}\`,
      })}</p>
      <p id="v3">{t({
        context: "This is a context",
        message: \`Message with interpolation: \${value}\`,
      })}</p>
      <p id="v4">{t({
        comment: "This is a comment",
        message: \`Message with interpolation: \${value}\`,
      })}</p>

      <p id="p1a">{t\`Message without interpolation\`}</p>
      <p id="p1b">{t({
        message: "Message without interpolation",
      })}</p>
      <p id="p2">{t({
        id: "no-interpolation-with-id",
        message: "Message without interpolation",
      })}</p>
      <p id="p3">{t({
        context: "This is a context",
        message: "Message without interpolation",
      })}</p>
      <p id="p4">{t({
        comment: "This is a comment",
        message: "Message without interpolation",
      })}</p>
    `,
  },
  {
    name: "with-id-context-comment-component",
    officialReact: dedent`
      import { Trans } from "@lingui/react/macro";

      const value = "foo";

      function Example() {
        return (
          <>
            <Trans>Message with interpolation: {value}</Trans>
            <Trans id="with-interpolation-with-id">Message with interpolation: {value}</Trans>
            <Trans context="This is a context">Message with interpolation: {value}</Trans>
            <Trans comment="This is a comment">Message with interpolation: {value}</Trans>

            <Trans>Message without interpolation</Trans>
            <Trans id="no-interpolation-with-id">Message without interpolation</Trans>
            <Trans context="This is a context">Message without interpolation</Trans>
            <Trans comment="This is a comment">Message without interpolation</Trans>
          </>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";

        const value = $state("foo");
      </script>

      <Trans>Message with interpolation: {value}</Trans>
      <Trans>Message with interpolation: {value}</Trans>
      <Trans id="with-interpolation-with-id">Message with interpolation: {value}</Trans>
      <Trans context="This is a context">Message with interpolation: {value}</Trans>
      <Trans comment="This is a comment">Message with interpolation: {value}</Trans>

      <Trans>Message without interpolation</Trans>
      <Trans>Message without interpolation</Trans>
      <Trans id="no-interpolation-with-id">Message without interpolation</Trans>
      <Trans context="This is a context">Message without interpolation</Trans>
      <Trans comment="This is a comment">Message without interpolation</Trans>
    `,
    astro: dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";

      const value = "foo";
      ---

      <Trans>Message with interpolation: {value}</Trans>
      <Trans>Message with interpolation: {value}</Trans>
      <Trans id="with-interpolation-with-id">Message with interpolation: {value}</Trans>
      <Trans context="This is a context">Message with interpolation: {value}</Trans>
      <Trans comment="This is a comment">Message with interpolation: {value}</Trans>

      <Trans>Message without interpolation</Trans>
      <Trans>Message without interpolation</Trans>
      <Trans id="no-interpolation-with-id">Message without interpolation</Trans>
      <Trans context="This is a context">Message without interpolation</Trans>
      <Trans comment="This is a comment">Message without interpolation</Trans>
    `,
  },
  {
    name: "component-whitespacing",
    whitespace: "jsx",
    officialReact: dedent`
      import { Trans } from "@lingui/react/macro";

      function Example() {
        return (
          <>
            <Trans>
              Before{" "}
              {value}{" "}
              After
            </Trans>
            <Trans>
              Before
              {value}
              After
            </Trans>
            <Trans>
              Before {value} After
            </Trans>
            <Trans>
              {" "}Before{" "}
              {" "}{value}{" "}
              {" "}After{" "}
            </Trans>
          </>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
      </script>

      <Trans>
        Before{" "}
        {value}{" "}
        After
      </Trans>
      <Trans>
        Before
        {value}
        After
      </Trans>
      <Trans>
        Before {value} After
      </Trans>
      <Trans>
        {" "}Before{" "}
        {" "}{value}{" "}
        {" "}After{" "}
      </Trans>
    `,
    astro: dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";
      ---

      <Trans>
        Before{" "}
        {value}{" "}
        After
      </Trans>
      <Trans>
        Before
        {value}
        After
      </Trans>
      <Trans>
        Before {value} After
      </Trans>
      <Trans>
        {" "}Before{" "}
        {" "}{value}{" "}
        {" "}After{" "}
      </Trans>
    `,
  },
  {
    name: "component-whitespacing-auto",
    whitespace: "auto",
    officialReact: dedent`
      import { Trans } from "@lingui/react/macro";

      function Example() {
        return (
          <>
            <Trans>
              Before{" "}
              {value}{" "}
              After
            </Trans>
            <Trans>
              Before{" "}
              {value}{" "}
              After
            </Trans>
            <Trans>
              Before {value} After
            </Trans>
            <Trans>
              {" "}Before{" "}
              {" "}{value}{" "}
              {" "}After{" "}
            </Trans>
          </>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
      </script>

      <Trans>
        Before{" "}
        {value}{" "}
        After
      </Trans>
      <Trans>
        Before
        {value}
        After
      </Trans>
      <Trans>
        Before {value} After
      </Trans>
      <Trans>
        {" "}Before{" "}
        {" "}{value}{" "}
        {" "}After{" "}
      </Trans>
    `,
    astro: dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";
      ---

      <Trans>
        Before{" "}
        {value}{" "}
        After
      </Trans>
      <Trans>
        Before
        {value}
        After
      </Trans>
      <Trans>
        Before {value} After
      </Trans>
      <Trans>
        {" "}Before{" "}
        {" "}{value}{" "}
        {" "}After{" "}
      </Trans>
    `,
  },
  {
    name: "unicode-adjacent-text",
    officialReact: dedent`
      import { Trans } from "@lingui/react/macro";

      export function Example({ name }: { name: string }) {
        return (
          <section>
            前置き😀
            <Trans>ようこそ <strong>{name}</strong> さん🚀</Trans>
            後置き🎉
          </section>
        );
      }
    `,
    svelte: dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";

        let name = $state("世界");
      </script>

      <section>
        前置き😀
        <Trans>ようこそ <strong>{name}</strong> さん🚀</Trans>
        後置き🎉
      </section>
    `,
    astro: dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";

      const name = "世界";
      ---

      <section>
        前置き😀
        <Trans>ようこそ <strong>{name}</strong> さん🚀</Trans>
        後置き🎉
      </section>
    `,
  },
];
