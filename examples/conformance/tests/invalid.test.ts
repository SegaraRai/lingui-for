import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  transformAstroFixture,
  transformOfficialCore,
  transformOfficialReact,
  transformSvelteFixture,
} from "./support/transforms.ts";

describe("invalid transform cases", () => {
  test("official core rejects malformed plural() calls, and Astro/Svelte reject the same shape", async () => {
    expect(() =>
      transformOfficialCore(dedent`
        import { plural, t } from "@lingui/core/macro";

        export const label = t({
          message: plural(),
        });
      `),
    ).toThrow(/Unsupported macro usage/);

    await expect(
      transformSvelteFixture(dedent`
        <script lang="ts">
          import { plural, t } from "lingui-for-svelte/macro";

          const label = $t({
            message: plural(),
          });
        </script>
      `),
    ).rejects.toThrow(/Unsupported macro usage/);
    await expect(
      transformAstroFixture(dedent`
        ---
        import { plural, t } from "lingui-for-astro/macro";

        const label = t({
          message: plural(),
        });
        ---
      `),
    ).rejects.toThrow(/Unsupported macro usage/);
  });

  test("official react rejects spread children in Trans, and Astro/Svelte also reject them", async () => {
    expect(() =>
      transformOfficialReact(dedent`
        import { Trans } from "@lingui/react/macro";

        export function Example(props: { name: string }) {
          return <Trans>Hello {...props}</Trans>;
        }
      `),
    ).toThrow(/Spread could not be used as Trans children/);

    await expect(
      transformSvelteFixture(dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";

          const props = {
            name: "Ada",
          };
        </script>

        <Trans>Hello {...props}</Trans>
      `),
    ).rejects.toThrow();

    await expect(
      transformAstroFixture(dedent`
        ---
        import { Trans } from "lingui-for-astro/macro";

        const props = {
          name: "Ada",
        };
        ---

        <Trans>Hello {...props}</Trans>
      `),
    ).rejects.toThrow(/Spread could not be used as Trans children/);
  });

  test("svelte still rejects bare direct t in .svelte files", async () => {
    await expect(
      transformSvelteFixture(dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          const label = t\`Hello\`;
        </script>

        <p>{label}</p>
      `),
    ).rejects.toThrow(/Bare `t` in `.svelte` files is not allowed/);
  });

  test("svelte still rejects bare direct plural in .svelte files", async () => {
    await expect(
      transformSvelteFixture(dedent`
        <script lang="ts">
          import { plural } from "lingui-for-svelte/macro";

          let count = $state(1);
          const label = plural(count, {
            one: "# Book",
            other: "# Books",
          });
        </script>

        <p>{label}</p>
      `),
    ).rejects.toThrow(/Bare `plural` in `.svelte` files is only allowed/);
  });
});
