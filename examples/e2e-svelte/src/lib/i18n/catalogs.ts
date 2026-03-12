export const catalogs = {
  en: {
    "kit.app.title": "lingui-svelte SvelteKit example",
    "kit.nav.home": "Home",
    "kit.nav.playground": "Playground",
    "kit.locale.en": "English",
    "kit.locale.ja": "Japanese",
    "kit.home.eyebrow": "SvelteKit route",
    "kit.home.title": "Lingui macros inside routes, components, and plain modules",
    "kit.home.body":
      "This page mixes load functions, component props, raw TypeScript, and .svelte.ts state.",
    "kit.card.route.eyebrow": "Route load",
    "kit.card.route.title": "+page.ts returns message descriptors",
    "kit.card.route.body":
      "The route serializes descriptors produced by lingui-svelte/macro and the page renders them with the runtime.",
    "kit.card.component.eyebrow": "Component",
    "kit.card.component.title": "Reusable Svelte components stay thin",
    "kit.card.component.body":
      "Components receive descriptors and call the runtime without duplicating extractor logic.",
    "kit.card.module.eyebrow": "Raw .ts",
    "kit.card.module.title": "Plain TypeScript can define shared copy",
    "kit.card.module.body":
      "Regular modules export descriptors and helper metadata for routes and components.",
    "kit.playground.eyebrow": ".svelte.ts state",
    "kit.playground.title": "Reactive state from a .svelte.ts module",
    "kit.playground.body":
      "This route uses a rune-backed module to hold client state and translate summaries through Lingui.",
    "kit.playground.field.name": "Name",
    "kit.playground.field.count": "Count",
    "kit.playground.increment": "Add",
    "kit.playground.decrement": "Remove",
    "kit.playground.summary":
      "{count, plural, one {# queued action for {name}} other {# queued actions for {name}}}",
    "kit.playground.helper":
      "The summary above comes from a .svelte.ts file, not directly from the component.",
    "kit.playground.routeLink": "Open the playground route",
  },
  ja: {
    "kit.app.title": "lingui-svelte の SvelteKit サンプル",
    "kit.nav.home": "ホーム",
    "kit.nav.playground": "プレイグラウンド",
    "kit.locale.en": "英語",
    "kit.locale.ja": "日本語",
    "kit.home.eyebrow": "SvelteKit ルート",
    "kit.home.title":
      "ルート、コンポーネント、素のモジュールで Lingui macro を使う",
    "kit.home.body":
      "このページは load 関数、コンポーネント props、通常の TypeScript、.svelte.ts の状態管理を混ぜています。",
    "kit.card.route.eyebrow": "Route load",
    "kit.card.route.title": "+page.ts が message descriptor を返す",
    "kit.card.route.body":
      "lingui-svelte/macro が作った descriptor を route から返し、ページ側で runtime に流しています。",
    "kit.card.component.eyebrow": "コンポーネント",
    "kit.card.component.title": "再利用コンポーネントは薄いまま保てる",
    "kit.card.component.body":
      "コンポーネントは descriptor を受け取り、extractor ロジックを重複させずに runtime だけ呼びます。",
    "kit.card.module.eyebrow": "Raw .ts",
    "kit.card.module.title": "通常の TypeScript で共有 copy を定義できる",
    "kit.card.module.body":
      "通常モジュールが descriptor と補助データを export し、route と component がそれを再利用します。",
    "kit.playground.eyebrow": ".svelte.ts state",
    "kit.playground.title": ".svelte.ts モジュールの reactive state",
    "kit.playground.body":
      "このルートは rune ベースのモジュールで client state を保持し、その summary を Lingui 経由で翻訳します。",
    "kit.playground.field.name": "名前",
    "kit.playground.field.count": "件数",
    "kit.playground.increment": "追加",
    "kit.playground.decrement": "減らす",
    "kit.playground.summary":
      "{count, plural, one {{name} の待機中アクション # 件} other {{name} の待機中アクション # 件}}",
    "kit.playground.helper":
      "上の summary は component ではなく .svelte.ts ファイルから作っています。",
    "kit.playground.routeLink": "プレイグラウンドへ移動",
  },
} as const;

export type SupportedLocale = keyof typeof catalogs;
