# lingui-for

_Bring Lingui's macro-first localization model to Svelte and Astro._

[![npm](https://img.shields.io/npm/v/lingui-for-svelte?label=lingui-for-svelte)](https://www.npmjs.com/package/lingui-for-svelte)
[![npm](https://img.shields.io/npm/v/lingui-for-astro?label=lingui-for-astro)](https://www.npmjs.com/package/lingui-for-astro)
[![npm](https://img.shields.io/npm/v/unplugin-lingui-macro?label=unplugin-lingui-macro)](https://www.npmjs.com/package/unplugin-lingui-macro)
[![Documentation](https://img.shields.io/badge/docs-lingui--for.roundtrip.dev-blue)](https://lingui-for.roundtrip.dev/)

lingui-for exists for teams who want the strengths of Lingui in frameworks that need framework-specific integration. It keeps Lingui's core authoring model intact while making it feel natural in Svelte and Astro.

That means you can keep the parts of Lingui that are actually valuable: powerful macros, interpolation, rich-text translations, extract and compile workflows, and compact compiled message output. And you get them in a form that matches each framework instead of fighting it.

In Svelte, that means translations fit naturally into the framework's reactive model. In Astro, that means request-aware translation with clear runtime boundaries. The goal is not to invent a new i18n system. The goal is to make Lingui work properly where users already want to use it.

```svelte
<!-- Svelte -->
<script>
  import { t, Trans } from "lingui-for-svelte/macro";

  let count = $state(1);
</script>

<h1>{$t`Hello from Svelte`}</h1>

<p>
  <Trans>{count} item selected</Trans>
</p>
```

```astro
---
// Astro
import { t, Trans } from "lingui-for-astro/macro";
---

<h1>{t`Hello from Astro`}</h1>

<p>
  <Trans><strong>Macro-first</strong> translation in Astro</Trans>
</p>
```

## Why lingui-for

- Full Lingui-style macro authoring in Svelte and Astro.
- Support for interpolation and rich-text translations, including component macros such as `Trans`, `Plural`, `Select`, and `SelectOrdinal`.
- The usual Lingui extraction and compilation workflow, so existing Lingui knowledge still applies.
- Access to Lingui's runtime advantages, including compact compiled message output.
- Framework-aware behavior instead of a generic wrapper:
  request-aware in Astro, reactive in Svelte.
- Smooth adoption without switching to a different message model.

## Framework Fit

lingui-for does not force identical behavior across frameworks.

- Svelte gets reactive ergonomics because Svelte has a reactivity model that can host them naturally.
- Astro gets request-scoped translation because Astro is server-oriented and mostly non-reactive.

That asymmetry is intentional. The goal is not identical implementation. The goal is to deliver Lingui's value in the way each framework can support well.

## Choose Your Path

- Learn the design goals: <https://lingui-for.roundtrip.dev/concepts>
- Start with Svelte: <https://lingui-for.roundtrip.dev/frameworks/svelte/getting-started>
- Start with Astro: <https://lingui-for.roundtrip.dev/frameworks/astro/getting-started>
- Browse the macro reference: <https://lingui-for.roundtrip.dev/macros/core-macros>
- Working on this repository: jump to [For Contributors](#for-contributors)

## Packages

- [`lingui-for-svelte`](./packages/lingui-for-svelte): Lingui integration for Svelte.
- [`lingui-for-astro`](./packages/lingui-for-astro): Lingui integration for Astro.
- [`unplugin-lingui-macro`](./packages/unplugin-lingui-macro): Unplugin wrapper for Lingui macro transforms.

For package-level setup and API details, start with the README inside each package directory.

## For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, workspace structure, and development commands.
