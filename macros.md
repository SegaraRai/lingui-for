# Internal Lingui React Macro Inventory

このファイルは、Lingui 公式の React 向け user-facing macro API を、Svelte / Astro 版設計の比較材料として整理した**内部メモ**です。対象は `@lingui/core/macro` と `@lingui/react/macro` の公開面です。

## Status / confirmed findings

- このファイルは **lingui-for の現行 user-facing API 仕様書ではありません**。現行の公開仕様を確認したい場合は、[`apps/docs/src/content/docs/`](./apps/docs/src/content/docs/) 配下のドキュメントと各 package README を正として扱ってください。
- 以前の参照元には開発者ローカル環境の絶対パスが残っていましたが、この repository では検証不能で誤解を招くため、upstream の repo 内パス表記へ置き換えました。
- この inventory は upstream Lingui React / core の公開面を列挙しているため、そのまま読むと lingui-for に存在しない API (`useLingui` など) や React 固有の lowering まで「あるもの」に見えます。**比較用メモであって、実装済み機能一覧ではありません。**
- 調査時に「無思考で存在していそう」に見えたコードのうち、少なくとも以下は意図を確認しました。
  - `packages/lingui-for-svelte/src/macro/index.ts`
  - `packages/lingui-for-astro/src/macro/index.ts`
    - `null as unknown as ...` の export は、macro-only component の authoring-time 型定義であり、runtime 実装の置き忘れではありません。コンパイル時に置換されます。
  - `packages/lingui-for-astro/src/integration/index.ts`
  - `packages/lingui-for-svelte/src/unplugin/index.ts`
    - `as any` / type assertion は見た目は怪しいものの、周辺コメントと使用箇所から、現時点では upstream toolchain 互換のための暫定 workaround と判断できます。

参照元 (upstream repo 内パス):

- `js-lingui/website/docs/ref/macro.mdx`
- `js-lingui/packages/react/macro/index.d.ts`
- `js-lingui/packages/macro/index.d.ts`

## Summary Table

| API             | Package               | Kind                | Can capture values?                                                                                                        | Locale source                                                                                                                | Lowering / Output                                                                                                                |
| --------------- | --------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `t`             | `@lingui/core/macro`  | JS macro            | Yes. Tagged template placeholders, descriptor `message`, nested `plural/select/selectOrdinal` can all contribute `values`. | Global `i18n` by default. Can be redirected via `runtimeConfigModule` or a custom instance path.                             | `i18n._(/*i18n*/ { id, message?, values? })`                                                                                     |
| `msg`           | `@lingui/core/macro`  | JS macro            | Yes. Same signature as `t`, so template placeholders and nested macros can produce `values`.                               | None at definition time. Locale is not consumed until later translation.                                                     | `/*i18n*/ { id, message?, values?, comment? }`                                                                                   |
| `defineMessage` | `@lingui/core/macro`  | JS macro            | Yes. Same behavior as `msg`.                                                                                               | None at definition time. Locale is not consumed until later translation.                                                     | `/*i18n*/ { id, message?, values?, comment? }`                                                                                   |
| `plural`        | `@lingui/core/macro`  | JS macro            | Yes. Always captures at least the selector `value`; may also capture interpolations inside branch strings.                 | Global `i18n` by default when used standalone. If nested inside `t`/`msg`, locale is deferred to the outer translation site. | Standalone: `i18n._(/*i18n*/ { id, message, values })`. Nested: contributes ICU fragment to outer `message` and merges `values`. |
| `select`        | `@lingui/core/macro`  | JS macro            | Yes. Captures selector `value`; may also capture interpolations inside branch strings.                                     | Global `i18n` by default when used standalone. If nested inside `t`/`msg`, locale is deferred to the outer translation site. | Standalone: `i18n._(/*i18n*/ { id, message, values })`. Nested: contributes ICU fragment to outer `message` and merges `values`. |
| `selectOrdinal` | `@lingui/core/macro`  | JS macro            | Yes. Captures selector `value`; may also capture interpolations inside branch strings.                                     | Global `i18n` by default when used standalone. If nested inside `t`/`msg`, locale is deferred to the outer translation site. | Standalone: `i18n._(/*i18n*/ { id, message, values })`. Nested: contributes ICU fragment to outer `message` and merges `values`. |
| `Trans`         | `@lingui/react/macro` | JSX macro component | Yes. Children expressions become message variables; inline JSX elements become `components`.                               | Local React-context `i18n` via runtime `@lingui/react` `Trans`.                                                              | Runtime `<Trans id=... message=... values? components? ... />`                                                                   |
| `Plural`        | `@lingui/react/macro` | JSX macro component | Yes. `value` is always captured; branch text may include interpolated values.                                              | Local React-context `i18n` via runtime `@lingui/react` `Trans`.                                                              | Runtime `<Trans id=... message=\"{value, plural, ...}\" values={...} ... />`                                                     |
| `Select`        | `@lingui/react/macro` | JSX macro component | Yes. `value` is always captured; branch text may include interpolated values.                                              | Local React-context `i18n` via runtime `@lingui/react` `Trans`.                                                              | Runtime `<Trans id=... message=\"{value, select, ...}\" values={...} ... />`                                                     |
| `SelectOrdinal` | `@lingui/react/macro` | JSX macro component | Yes. `value` is always captured; branch text may include interpolated values.                                              | Local React-context `i18n` via runtime `@lingui/react` `Trans`.                                                              | Runtime `<Trans id=... message=\"{value, selectOrdinal, ...}\" values={...} ... />`                                              |
| `useLingui`     | `@lingui/react/macro` | Hook macro          | Indirectly yes. It exposes a context-bound `t`, and that `t` captures values the same way as core `t`.                     | Local React-context `i18n` from runtime `useLingui()`.                                                                       | Runtime `useLingui()` call; macro-provided `t` lowers to context-bound `_` calls such as `_(/*i18n*/ { ... })`.                  |

## Details

### `t`

- Package: `@lingui/core/macro`
- Public shapes:
  - `` t`Hello ${name}` ``
  - `t({ id, message, comment, context? })`
- Value capture:
  - Simple variables are preserved by name, e.g. `{ name }`
  - Arbitrary expressions are indexed, e.g. `{ 0: new Date() }`
  - Nested core macros inside `message` also merge their captured values
- Locale timing:
  - Locale is not provided as an argument by the user
  - By default it comes from the imported global `i18n`
- Lowering:

```ts
i18n._(
  /*i18n*/ {
    id: "generated-or-explicit-id",
    message: "Hello {name}",
    values: { name },
  },
);
```

### `msg` / `defineMessage`

- Package: `@lingui/core/macro`
- Public shapes:
  - `` msg`Hello ${name}` ``
  - `defineMessage({ id?, message?, comment?, context? })`
- Value capture:
  - `t` と同じシグネチャなので、placeholder や nested macros の values を持てる
  - `message: \`Welcome, ${name}!\`` のような descriptor object でも values を持つ
- Locale timing:
  - 定義時には locale を取らない
  - locale が必要になるのは、この descriptor が後段で翻訳される時だけ
- Lowering:

```ts
/*i18n*/ {
  id: "generated-or-explicit-id",
  message: "Welcome, {name}",
  values: { name },
  comment: "optional",
}
```

補足:

- docs は `msg` を `t` と同じシグネチャだと明記している
- したがって `msg` も current values を束縛できる
- `msg` が lazy なのは「翻訳実行」が遅延されるだけで、`values` を持てないという意味ではない

### `plural`

- Package: `@lingui/core/macro`
- Public shape:
  - `plural(count, { one: "# Book", other: "# Books" })`
- Value capture:
  - selector の `count` は必ず values に入る
  - branch の template literal から追加 values が入る場合がある
- Locale timing:
  - 単独で使う場合はその場で global `i18n` に流れる
  - `t({ message: plural(...) })` や `msg({ message: plural(...) })` に入る場合、locale は outer translation site に委ねられる
- Lowering:
  - Standalone:

```ts
i18n._(
  /*i18n*/ {
    id: "generated-id",
    message: "{count, plural, one {# Book} other {# Books}}",
    values: { count },
  },
);
```

- Nested in `t`/`msg`:

```ts
/*i18n*/ {
  id: "generated-or-explicit-id",
  message: "{count, plural, one {{name} has # friend} other {{name} has # friends}}",
  values: { count, name },
}
```

### `select`

- Package: `@lingui/core/macro`
- Public shape:
  - `select(gender, { male: "he", female: "she", other: "they" })`
- Value capture:
  - selector の `gender` は必ず values に入る
  - branch 内 interpolation があれば追加 values を持てる
- Locale timing:
  - `plural` と同じ
- Lowering:
  - Standalone: `i18n._(/*i18n*/ { id, message: "{gender, select, ...}", values: { gender } })`
  - Nested: outer descriptor の `message` と `values` に統合される

### `selectOrdinal`

- Package: `@lingui/core/macro`
- Public shape:
  - `selectOrdinal(count, { one: "#st", two: "#nd", few: "#rd", other: "#th" })`
- Value capture:
  - selector の `count` は必ず values に入る
  - branch 内 interpolation があれば追加 values を持てる
- Locale timing:
  - `plural` と同じ
- Lowering:
  - Standalone: `i18n._(/*i18n*/ { id, message: "{count, selectOrdinal, ...}", values: { count } })`
  - Nested: outer descriptor の `message` と `values` に統合される

### `Trans`

- Package: `@lingui/react/macro`
- Public shape:
  - `<Trans>Hello {username}</Trans>`
  - `<Trans id="custom.id">Hello {username}</Trans>`
  - `<Trans>Read the <a href="/docs">docs</a>.</Trans>`
- Supported public props from docs:
  - `id`
  - `comment`
  - `context`
  - `render`
- Value capture:
  - child expression は values に入る
  - inline JSX / HTML は `components` に変換される
- Locale timing:
  - macro 呼び出し自体は locale を引数に取らない
  - locale は runtime `@lingui/react` `Trans` が読む
- Lowering:

```tsx
<Trans
  id="generated-or-explicit-id"
  message="Read the <0>docs</0>."
  components={{ 0: <a href="/docs" /> }}
/>
```

### `Plural`

- Package: `@lingui/react/macro`
- Public shape:
  - `<Plural value={count} one="Book" other="Books" />`
- Public props from docs:
  - required: `value`, `other`
  - optional: `format`, `offset`, `zero`, `one`, `two`, `few`, `many`, `_<number>`, `id`, `comment`, `context`, `render`
- Value capture:
  - `value` は必須で values に入る
  - branch 内に追加 interpolation があれば values に入る
- Locale timing:
  - locale は macro 引数ではなく runtime 側で解決
- Lowering:

```tsx
<Trans
  id="generated-or-explicit-id"
  message="{count, plural, one {Book} other {Books}}"
  values={{ count }}
/>
```

### `SelectOrdinal`

- Package: `@lingui/react/macro`
- Public shape:
  - `<SelectOrdinal value={count} one="#st" two="#nd" few="#rd" other="#th" />`
- Public props from docs:
  - required: `value`, `other`
  - optional: `offset`, `zero`, `one`, `two`, `few`, `many`, `_<number>`, `format`
- Value capture:
  - `value` は必須で values に入る
  - branch 内に追加 interpolation があれば values に入る
- Locale timing:
  - locale は macro 引数ではなく runtime 側で解決
- Lowering:

```tsx
<Trans
  id="generated-or-explicit-id"
  message="{count, selectOrdinal, one {#st} two {#nd} few {#rd} other {#th}}"
  values={{ count }}
/>
```

### `Select`

- Package: `@lingui/react/macro`
- Public shape:
  - `<Select value={gender} _male="His book" _female="Her book" other="Their book" />`
- Public props from docs:
  - required: `value`, `other`
  - optional: `_<case>`, `id`, `comment`, `context`, `render`
- Value capture:
  - `value` は必須で values に入る
  - branch 内に追加 interpolation があれば values に入る
- Locale timing:
  - locale は macro 引数ではなく runtime 側で解決
- Lowering:

```tsx
<Trans
  id="generated-or-explicit-id"
  message="{gender, select, male {His book} female {Her book} other {Their book}}"
  values={{ gender }}
/>
```

### `useLingui`

- Package: `@lingui/react/macro`
- Public shape:

```tsx
const { t } = useLingui();
const label = t`Text`;
```

- Public return shape from docs:
  - `i18n`
  - `t`
  - `defaultComponent`
- Value capture:
  - exposed `t` has the same signatures and value-capture behavior as core `t`
- Locale timing:
  - locale comes from the local `i18n` in React context, not from a macro argument
- Lowering:

```ts
const { _ } = useLingui();
const label = _(
  /*i18n*/ {
    id: "generated-id",
    message: "Text",
  },
);
```

## Practical Takeaways For Svelte Design

- React の user-facing macro family は `t` だけでなく `msg`, `plural`, `select`, `selectOrdinal`, `Trans`, `Plural`, `Select`, `SelectOrdinal`, `useLingui` まで含めて 1 セットで考える必要がある
- `msg` も values を持てる。`msg` が lazy なのは translation timing の話であって、value capture しないという意味ではない
- JSX component macros は最終的に runtime `Trans` に集約される
- locale はどの macro でもユーザー引数としては渡されず、global または context-bound `i18n` から解決される
