export type LocaleCode = "en" | "ja";

type LocalizedExpectations = Record<LocaleCode, readonly string[]>;

type HttpRouteExpectation = {
  expectedBody: LocalizedExpectations;
  expectedHtmlSnippets: readonly string[];
  path: string;
};

export type HttpRouteCase = {
  expectedBody: readonly string[];
  expectedHtmlSnippets: readonly string[];
  locale: LocaleCode;
  path: string;
};

export type BrowserLoadCase = {
  expectedBody: readonly string[];
  locale: LocaleCode;
  path: string;
};

const httpRouteExpectations: readonly HttpRouteExpectation[] = [
  {
    path: "/",
    expectedBody: {
      en: [
        "Lingui Astro multi-page playground",
        "One Astro app, several translation checkpoints",
        "Current page: Overview",
        "Server locale: English",
      ],
      ja: [
        "Lingui Astro マルチページプレイグラウンド",
        "1 つの Astro アプリで複数の翻訳チェックポイントを確認します",
        "現在のページ: 概要",
        "サーバーロケール: 日本語",
      ],
    },
    expectedHtmlSnippets: [
      'href="/server"',
      'href="/islands"',
      'href="/rich-text"',
      'href="/formats"',
      'href="/routing/alpha"',
      'href="/settings"',
      'href="/transitions"',
    ],
  },
  {
    path: "/server",
    expectedBody: {
      en: [
        "Server translation checks",
        "Astro pages render request-scoped translations through locals.",
        "The current locale label is English, and it comes from the same request.",
      ],
      ja: [
        "サーバー翻訳の確認",
        "Astro のページは locals 経由でリクエスト単位の翻訳を描画します。",
        "現在のロケールラベルは 日本語 で、同じリクエストから来ています。",
      ],
    },
    expectedHtmlSnippets: [],
  },
  {
    path: "/islands",
    expectedBody: {
      en: [
        "Island translation checks",
        "Svelte and React islands read the same active locale.",
        "Shared descriptor imported from plain TypeScript.",
      ],
      ja: [
        "アイランド翻訳の確認",
        "Svelte と React のアイランドは同じアクティブなロケールを読み取ります。",
        "素の TypeScript から import した共有ディスクリプタです。",
      ],
    },
    expectedHtmlSnippets: [],
  },
  {
    path: "/rich-text",
    expectedBody: {
      en: [
        "Rich text translation checks",
        "Rich text translations keep links and emphasis intact.",
        'Astro keeps the <a class="link link-primary" href="/settings">settings link</a> inside a translated sentence.',
        'Svelte keeps the <a class="link link-primary" href="/settings">settings link</a> inside a translated sentence.',
        'React keeps the <a class="link link-primary" href="/settings">settings link</a> inside a translated sentence.',
      ],
      ja: [
        "リッチテキスト翻訳の確認",
        "リンクと強調表示を保てます。",
        'Astro は翻訳された文の中でも<a class="link link-primary" href="/settings">設定リンク</a>を保てます。</p>',
        'Svelte は翻訳された文の中でも<a class="link link-primary" href="/settings">設定リンク</a>を保てます。</p>',
        'React は翻訳された文の中でも<a class="link link-primary" href="/settings">設定リンク</a>を保てます。</p>',
      ],
    },
    expectedHtmlSnippets: ['href="/settings"'],
  },
  {
    path: "/formats",
    expectedBody: {
      en: [
        "Format macro checks",
        "Plural and selection macros cover count, tone, and rank.",
        "Astro select says excited.",
      ],
      ja: [
        "フォーマットマクロの確認",
        "plural と selection マクロでカウント、トーン、順位を確認します。",
        "Astro の select は興奮しています。",
      ],
    },
    expectedHtmlSnippets: [],
  },
  {
    path: "/routing/alpha",
    expectedBody: {
      en: [
        "Dynamic route checks",
        "Now viewing the slug alpha.",
        "The locale cookie still applies here, so the translated page matches the previous request.",
      ],
      ja: [
        "動的ルートの確認",
        "現在表示中の slug は alpha です。",
        "ここでもロケールクッキーが適用されるため、翻訳されたページは前のリクエストと一致します。",
      ],
    },
    expectedHtmlSnippets: ['href="/routing/beta"'],
  },
  {
    path: "/settings",
    expectedBody: {
      en: [
        "Language settings",
        "The locale is stored in a cookie so the next request stays consistent.",
        "Current locale: English",
      ],
      ja: [
        "言語設定",
        "ロケールはクッキーに保存されるため、次のリクエストでも一貫性が保たれます。",
        "現在のロケール: 日本語",
      ],
    },
    expectedHtmlSnippets: ['href="/"'],
  },
  {
    path: "/init/inline",
    expectedBody: {
      en: [
        "Inline initialization check",
        "This page initializes Lingui in its own frontmatter.",
      ],
      ja: [
        "インライン初期化チェック",
        "このページはフロントマターで Lingui を初期化します。",
      ],
    },
    expectedHtmlSnippets: [],
  },
  {
    path: "/transitions",
    expectedBody: {
      en: [
        "Client transition checks",
        "Open no-router demo",
        "Open router demo",
      ],
      ja: [
        "クライアント遷移の確認",
        "ルーターなしデモを開く",
        "ルーターありデモを開く",
      ],
    },
    expectedHtmlSnippets: [
      'href="/transitions/no-router/a"',
      'href="/transitions/router/a"',
    ],
  },
  {
    path: "/transitions/no-router/a",
    expectedBody: {
      en: [
        "Transition demo without ClientRouter",
        "Volatile Svelte island",
        "Persisted-props React island",
      ],
      ja: [
        "ClientRouter なしの遷移デモ",
        "揮発性の Svelte アイランド",
        "プロパティが永続化された React アイランド",
      ],
    },
    expectedHtmlSnippets: [],
  },
  {
    path: "/transitions/router/a",
    expectedBody: {
      en: [
        "Transition demo with ClientRouter",
        "Persisted Svelte island",
        "Persisted-props React island",
      ],
      ja: [
        "ClientRouter ありの遷移デモ",
        "永続化された Svelte アイランド",
        "プロパティが永続化された React アイランド",
      ],
    },
    expectedHtmlSnippets: ['name="astro-view-transitions-enabled"'],
  },
];

export const httpRouteCases: readonly HttpRouteCase[] =
  httpRouteExpectations.flatMap((routeExpectation) =>
    (["en", "ja"] as const).map((locale) => ({
      expectedBody: routeExpectation.expectedBody[locale],
      expectedHtmlSnippets: routeExpectation.expectedHtmlSnippets,
      locale,
      path: routeExpectation.path,
    })),
  );

export const browserLoadCases: readonly BrowserLoadCase[] = [
  {
    path: "/?lang=ja",
    locale: "ja",
    expectedBody: [
      "1 つの Astro アプリで複数の翻訳チェックポイントを確認します",
      "サーバーロケール: 日本語",
      "クッキーを使って次のリクエストでもロケールを揃えます。",
    ],
  },
  {
    path: "/islands?lang=en",
    locale: "en",
    expectedBody: [
      "Svelte and React islands read the same active locale.",
      "Shared descriptor imported from plain TypeScript.",
      "The active locale reaches React through a dedicated Lingui instance.",
    ],
  },
  {
    path: "/rich-text?lang=en",
    locale: "en",
    expectedBody: [
      "Rich text translations keep links and emphasis intact.",
      "Imported review digest: Locale review digest",
      "Translation previews can show plain text and highlighted markup in the same sentence.",
      "The current locale review can summarize nested details such as",
      "3 highlighted queue items, plus",
      "the selected region Kansai.",
    ],
  },
  {
    path: "/rich-text?lang=ja",
    locale: "ja",
    expectedBody: [
      "リッチテキスト翻訳でもリンクと強調表示を保てます。",
      "取り込み済みレビュー要約: Locale review digest",
      "翻訳プレビューでは、同じ文の中に plain text と highlighted markup を表示できます。",
      "現在のロケールレビューでは、次のような詳細を要約できます",
      "3 件の注目キュー項目と",
      "選択中のリージョン Kansai。",
    ],
  },
  {
    path: "/formats?lang=ja",
    locale: "ja",
    expectedBody: [
      "plural と selection マクロでカウント、トーン、順位を確認します。",
      "Astro の select は興奮しています。",
      "Svelte はコンポーネントコードの中で plural、select、selectOrdinal マクロを実行します。",
    ],
  },
  {
    path: "/settings?lang=ja",
    locale: "ja",
    expectedBody: [
      "言語設定",
      "現在のロケール: 日本語",
      "Astro はリクエスト単位の locals を使います。",
    ],
  },
  {
    path: "/routing/alpha?lang=ja",
    locale: "ja",
    expectedBody: [
      "動的ルートでも Astro.url とルートデータのパラメータを使って翻訳できます。",
      "現在表示中の slug は alpha です。",
      "ここでもロケールクッキーが適用されるため、翻訳されたページは前のリクエストと一致します。",
    ],
  },
];

export const localeNavigationExpectation = {
  startPath: "/settings?lang=en",
  expectedBody: [
    "動的ルートでも Astro.url とルートデータのパラメータを使って翻訳できます。",
    "現在表示中の slug は alpha です。",
    "ここでもロケールクッキーが適用されるため、翻訳されたページは前のリクエストと一致します。",
  ],
};
