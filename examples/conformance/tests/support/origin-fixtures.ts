import dedent from "dedent";

export type ExtractOriginFixture = {
  framework: "astro" | "svelte";
  name: string;
  filename: string;
  source: string;
  expectations: ReadonlyArray<{
    message: string;
    needle: string;
    column?: number;
  }>;
};

export const extractOriginFixtures: readonly ExtractOriginFixture[] = [
  {
    framework: "svelte",
    name: "svelte origin mapping",
    filename: "/virtual/extract-origin.svelte",
    source: dedent`
      <script lang="ts">
        import { t, Trans } from "lingui-for-svelte/macro";

        const scriptLabel = t.eager\`Script origin message\`;
      </script>

      <p>{$t\`Template origin message\`}</p>
      <Trans>Component origin message</Trans>
    `,
    expectations: [
      {
        message: "Script origin message",
        needle: "const scriptLabel = t.eager`Script origin message`;",
        column: 0,
      },
      {
        message: "Template origin message",
        needle: "$t`Template origin message`",
      },
      {
        message: "Component origin message",
        needle: "<Trans>Component origin message</Trans>",
      },
    ],
  },
  {
    framework: "astro",
    name: "astro origin mapping",
    filename: "/virtual/extract-origin.astro",
    source: dedent`
      ---
      import { t, Trans } from "lingui-for-astro/macro";

      const scriptLabel = t\`Script origin message\`;
      ---

      <p>{t\`Template origin message\`}</p>
      <Trans>Component origin message</Trans>
    `,
    expectations: [
      {
        message: "Script origin message",
        needle: "const scriptLabel = t`Script origin message`;",
        column: 0,
      },
      {
        message: "Template origin message",
        needle: "t`Template origin message`",
      },
      {
        message: "Component origin message",
        needle: "<Trans>Component origin message</Trans>",
      },
    ],
  },
];
