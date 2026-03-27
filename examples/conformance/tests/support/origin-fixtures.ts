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
        needle: "t.eager`Script origin message`",
      },
      {
        message: "Template origin message",
        needle: "t`Template origin message`",
      },
      {
        message: "Component origin message",
        needle: "Component origin message",
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
        needle: "t`Script origin message`",
      },
      {
        message: "Template origin message",
        needle: "t`Template origin message`",
      },
      {
        message: "Component origin message",
        needle: "Component origin message",
      },
    ],
  },
  {
    framework: "svelte",
    name: "svelte unicode origin mapping",
    filename: "/virtual/extract-origin-unicode.svelte",
    source: dedent`
      <script lang="ts">
        import { t, Trans } from "lingui-for-svelte/macro";

        const scriptLabel = t.eager\`スクリプト😀メッセージ\`;
      </script>

      <p>前置き🎌 {$t\`テンプレート🚀メッセージ\`} 後置き🍣</p>
      <Trans>ようこそ <strong>{"世界😀"}</strong> さん🎉</Trans>
    `,
    expectations: [
      {
        message: "スクリプト😀メッセージ",
        needle: "t.eager`スクリプト😀メッセージ`",
      },
      {
        message: "テンプレート🚀メッセージ",
        needle: "t`テンプレート🚀メッセージ`",
      },
      {
        message: "ようこそ <0>世界😀</0> さん🎉",
        needle: "ようこそ ",
      },
    ],
  },
  {
    framework: "astro",
    name: "astro unicode origin mapping",
    filename: "/virtual/extract-origin-unicode.astro",
    source: dedent`
      ---
      import { t, Trans } from "lingui-for-astro/macro";

      const scriptLabel = t\`フロントマター😀メッセージ\`;
      ---

      <p>前置き🎌 {t\`テンプレート🚀メッセージ\`} 後置き🍣</p>
      <Trans>ようこそ <strong>{"世界😀"}</strong> さん🎉</Trans>
    `,
    expectations: [
      {
        message: "フロントマター😀メッセージ",
        needle: "t`フロントマター😀メッセージ`",
      },
      {
        message: "テンプレート🚀メッセージ",
        needle: "t`テンプレート🚀メッセージ`",
      },
      {
        message: "ようこそ <0>世界😀</0> さん🎉",
        needle: "ようこそ ",
      },
    ],
  },
];
