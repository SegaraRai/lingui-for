export type LocaleCode = "en" | "ja";

type LocalizedExpectations = Record<LocaleCode, readonly string[]>;

export type PlaygroundRouteExpectation = {
  path: string;
  expectations: LocalizedExpectations;
};

export type BrowserRouteExpectation = {
  expectedBody: readonly string[];
  locale: LocaleCode;
  path: string;
};

export type PlaygroundLocaleCase = {
  expectedBody: readonly string[];
  locale: LocaleCode;
  path: string;
};

export const homePageExpectations: LocalizedExpectations = {
  en: [
    "Lingui in a small SvelteKit application",
    "The server remembers your preferred language",
    "Messages live next to the code that renders them",
  ],
  ja: [
    "小さな SvelteKit アプリで使う Lingui",
    "サーバーが選択した言語を記憶する",
    "メッセージは描画するコードの近くに置く",
  ],
};

export const settingsPageExpectations: LocalizedExpectations = {
  en: [
    "Language preference",
    "Current language",
    "Choose a language with the switcher in the header.",
  ],
  ja: ["言語設定", "現在の言語", "ヘッダーの切り替え"],
};

export const playgroundRouteExpectations: readonly PlaygroundRouteExpectation[] =
  [
    {
      path: "/playground/basic",
      expectations: {
        en: [
          "Direct macros in Svelte components",
          "Immediate translation in markup.",
          "Hello Svelte from the basic route.",
          "Descriptor imported from plain TypeScript.",
          "A plain TypeScript module can define Lingui descriptors for Svelte.",
        ],
        ja: [
          "Svelte コンポーネントで直接マクロを使う",
          "マークアップ内でそのまま翻訳する例。",
          "ベーシックルートからこんにちは、Svelte。",
          "素の TypeScript から import したディスクリプタです。",
          "素の TypeScript モジュールでも Svelte 向けの Lingui ディスクリプタを定義できます。",
        ],
      },
    },
    {
      path: "/playground/reactive",
      expectations: {
        en: [
          "$t and rune-backed state",
          "Hello SvelteKit from the reactive route.",
          "Count: 2",
        ],
        ja: [
          "$t とルーンベースのステート",
          "リアクティブルートからこんにちは、SvelteKit。",
          "件数: 2",
        ],
      },
    },
    {
      path: "/playground/reactivity",
      expectations: {
        en: [
          "$t script and template reactivity",
          "Current demo value",
          "Alpha",
          "Script direct static reactivity.",
          "Template static reactivity.",
        ],
        ja: [
          "$t の script と template のリアクティビティ",
          "現在のデモ値",
          "Alpha",
          "スクリプトの直接固定リアクティビティ。",
          "テンプレートの固定リアクティビティ。",
        ],
      },
    },
    {
      path: "/playground/syntax",
      expectations: {
        en: [
          "$t across Svelte syntax positions",
          "Status summary: idle",
          "Filter text: (empty)",
          "Row 1: placeholder",
          "Keyed subtree revision 1",
        ],
        ja: [
          "Svelte 構文の各所で使う $t",
          "状態サマリー: アイドル",
          "フィルタ文字列: （未入力）",
          "行 1: placeholder",
          "キー付きサブツリーのリビジョン 1",
        ],
      },
    },
    {
      path: "/playground/rich-text",
      expectations: {
        en: [
          "Embedded elements and components inside Trans",
          'href="/settings"',
          "cookie-backed locale",
          "semantic emphasis",
        ],
        ja: [
          "Trans 内の埋め込み要素とコンポーネント",
          'href="/settings"',
          "クッキーで保持されるロケール",
          "意味のある強調",
        ],
      },
    },
    {
      path: "/playground/components",
      expectations: {
        en: [
          "ICU component macros",
          "2 component tasks are queued",
          "They approve the locale switch.",
          "2nd release candidate",
        ],
        ja: [
          "ICU コンポーネントマクロ",
          "コンポーネントタスクは 2 件待機中です",
          "彼らはロケール切り替えを承認しました。",
          "第 2 リリース候補",
        ],
      },
    },
    {
      path: "/playground/ids",
      expectations: {
        en: [
          "Targeted id, comment, and context coverage",
          "Explicit id from a Trans component.",
          "Explicit id from t({...}).",
          "Explicit id from a plain descriptor.",
        ],
        ja: [
          "id、コメント、コンテキストの確認に絞る",
          "Trans コンポーネントからの明示的な id。",
          "t({...}) からの明示的な id。",
          "ディスクリプタからの明示的な id。",
        ],
      },
    },
  ];

export const playgroundLocaleCases: readonly PlaygroundLocaleCase[] =
  playgroundRouteExpectations.flatMap((routeExpectation) =>
    (["en", "ja"] as const).map((locale) => ({
      expectedBody: routeExpectation.expectations[locale],
      locale,
      path: routeExpectation.path,
    })),
  );

export const browserRouteExpectations: readonly BrowserRouteExpectation[] = [
  {
    path: "/?lang=ja",
    locale: "ja",
    expectedBody: ["小さな SvelteKit アプリで使う Lingui", "設定"],
  },
  {
    path: "/playground/reactive?lang=en",
    locale: "en",
    expectedBody: [
      "$t and rune-backed state",
      "Hello SvelteKit from the reactive route.",
      "Count: 2",
    ],
  },
  {
    path: "/playground/reactive?lang=ja",
    locale: "ja",
    expectedBody: [
      "$t とルーンベースのステート",
      "リアクティブルートからこんにちは、SvelteKit。",
      "件数: 2",
      "現在の状態",
    ],
  },
  {
    path: "/playground/rich-text?lang=ja",
    locale: "ja",
    expectedBody: ["クッキーで保持されるロケール", "意味のある強調"],
  },
  {
    path: "/playground/reactivity?lang=ja",
    locale: "ja",
    expectedBody: [
      "$t の script と template のリアクティビティ",
      "現在のデモ値",
      "Alpha",
      "スクリプトの直接固定リアクティビティ。",
      "テンプレートの固定リアクティビティ。",
    ],
  },
  {
    path: "/playground/syntax?lang=ja",
    locale: "ja",
    expectedBody: [
      "Svelte 構文の各所で使う $t",
      "状態サマリー: アイドル",
      "フィルタ文字列: （未入力）",
      "キー付きサブツリーのリビジョン 1",
    ],
  },
  {
    path: "/playground/components?lang=ja",
    locale: "ja",
    expectedBody: [
      "コンポーネントタスクは 2 件待機中です",
      "ロケール切り替えを承認しました。",
      "第 2 リリース候補",
    ],
  },
  {
    path: "/playground/ids?lang=ja",
    locale: "ja",
    expectedBody: [
      "id、コメント、コンテキストの確認に絞る",
      "Trans コンポーネントからの明示的な id。",
    ],
  },
];

export const localeSwitchExpectation = {
  startPath: "/?lang=en",
  targetLocale: "ja" as const,
  expectedBody: [
    "小さな SvelteKit アプリで使う Lingui",
    "サーバーが選択した言語を記憶する",
  ],
};
