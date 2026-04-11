# lingui-for-svelte Reactivity Flow

This document explains how `lingui-for-svelte` wires Lingui into Svelte's
reactive model.

The runtime has four main pieces:

- `setLinguiContext` / `getLinguiContext` in `src/runtime/core/context.ts`
- `createI18nStore` in `src/runtime/core/context.ts`
- `createTranslationStore` in `src/runtime/core/translation-store.ts`
- compiler-injected accessors created by `createLinguiAccessors`

At a high level:

- application code installs an `I18n` instance into Svelte context
- the runtime builds one shared Svelte store for Lingui change notifications
- the runtime wraps that shared store in a callable translation store
- compiled code reads translations either imperatively or reactively
- Lingui `"change"` events propagate back through the store and trigger updates

## 1. Context Setup

`setLinguiContext(instance)` is the entry point that turns a raw Lingui
instance into a runtime context for a Svelte subtree.

```mermaid
flowchart TD
    A[Application / layout component] --> B["setLinguiContext(i18n)"]
    B --> C["createLinguiContext(i18n)"]
    C --> D[i18n: raw Lingui instance]
    C --> E["i18nStore: Readable<I18n>"]
    E --> F[createI18nStore]
    C --> G[_: TranslationStore]
    G --> H[createTranslationStore]
    H --> I[callable translate function]
    H --> J[shared readable translator store]
    B --> K[setContext LINGUI_CONTEXT]
    K --> L[Descendant components can call getLinguiContext]
```

## 2. What the Translation Store Actually Is

`TranslationStore` is intentionally both:

- a callable translator: `translate(descriptor)`
- a Svelte readable store: `translate.subscribe(...)`

Direct calls and subscriptions still take different paths, but both now sit on
top of a single shared source store.

```mermaid
flowchart TD
    A[TranslationStore]
    A --> B[Direct call path]
    A --> C[Subscription path]

    B --> D[stable i18n reference]
    D --> E["i18n._(...args)"]

    C --> F[shared translatorStore]
    F --> G["derived(i18nStore, bindTranslate)"]
    G --> H[shared i18nStore]
    H --> I[subscriber receives fresh translator fn]
```

The important consequence is that `TranslationStore.subscribe(...)` no longer
creates a fresh `readable` + `derived` chain for every subscriber. Subscribers
share one translator store per Lingui context.

## 3. How Lingui Change Events Reach Svelte

The reactive path exists because `createI18nStore(instance)` subscribes to
Lingui's `"change"` event and re-emits the same instance through one shared
Svelte `readable` store. `createTranslationStore(...)` then derives translator
functions from that shared source.

```mermaid
sequenceDiagram
    participant App as App code
    participant I18n as Lingui I18n
    participant Ctx as Lingui context
    participant I18nStore as shared i18nStore
    participant Store as shared TranslationStore
    participant Svelte as Svelte subscriber

    App->>Ctx: setLinguiContext(i18n)
    Ctx->>I18nStore: createI18nStore(instance)
    Ctx->>Store: createTranslationStore(i18nStore, instance)
    Svelte->>Store: subscribe(run)
    Store->>I18nStore: subscribe
    I18nStore->>I18n: on("change", update)
    App->>I18n: load / activate locale
    I18n-->>I18nStore: "change"
    I18nStore-->>Store: emit same instance
    Store-->>Svelte: emit rebound translate fn
    Svelte-->>Svelte: recompute $translate(...)
```

This means the reactive fan-out now looks like:

- one Lingui `"change"` listener per active context store subscription set
- one shared derived translator store per context
- many Svelte subscribers hanging off that shared translator store

## 4. Why `createLinguiAccessors` Exists

Compiled components cannot always read Svelte context immediately.

Generated code may need to install helper bindings before user setup code has
run, but the actual Lingui context may only be available after that setup
finishes. `createLinguiAccessors` solves this by lazily resolving and caching
the context.

```mermaid
flowchart TD
    A[Compiled component prelude] --> B["createLinguiAccessors()"]
    B --> C[cached = null]
    B --> D["getI18n()"]
    B --> E[_ callable store proxy]
    B --> F["prime()"]

    D --> G[resolve]
    E --> G
    F --> G
    G --> H{cached exists?}
    H -- no --> I["getLinguiContext()"]
    I --> J[cache LinguiContext]
    H -- yes --> J
```

`prime()` is injected at the end of the transformed instance script so the
context is resolved after user initialization logic has had a chance to install
it.

## 5. Compiled Code: Imperative vs Reactive Reads

The Svelte transform injects two different runtime bindings:

- `getI18n`: used for explicit eager reads such as `t.eager(...)`
- `_`: used for reactive reads such as `$t(...)`, `$plural(...)`, and friends

That means the compiler deliberately separates:

- non-reactive translation work, which reads `i18n._(...)` directly through
  the lazy accessor
- reactive translation work, which subscribes through the translation store

```mermaid
flowchart LR
    A[Transformed component]
    A --> B[__l4s_getI18n]
    A --> C[__l4s_translate]

    B --> D[imperative path]
    D --> E["getI18n()._ descriptor"]

    C --> F[reactive path]
    F --> G[TranslationStore subscribe]
    G --> H[Svelte invalidation / rerender]
```

## 6. RuntimeTrans in This Model

`RuntimeTrans` is now a thin consumer of the same runtime context:

- it accepts a `descriptor`
- it translates through the reactive translator from context
- if rich-text `components` are present, it post-processes the translated
  string into render nodes

```mermaid
flowchart TD
    A[RuntimeTrans props]
    A --> B[descriptor]
    A --> C[components optional]
    B --> D["getLinguiContext()._"]
    D --> E[translate descriptor]
    E --> F[translated string]
    C --> G{components present?}
    G -- no --> H[render plain text]
    G -- yes --> I[formatRichTextTranslation]
    I --> J[RenderTransNodes]
```

## 7. Mental Model

If you want the shortest possible mental model, it is this:

- Lingui owns translation state
- Svelte context makes that state reachable
- one shared `i18nStore` bridges Lingui events into Svelte
- `TranslationStore` is a callable facade over that shared reactive source
- compiler output chooses whether a translation should be imperative or
  reactive
- `RuntimeTrans` is just another consumer of the same reactive translator
