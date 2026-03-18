<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  const sections = [
    {
      href: "/playground/basic",
      eyebrow: $t`Basic`,
      title: $t`Direct macro usage in Svelte components`,
      body: $t`Covers t, msg, and RuntimeTrans without explicit ids.`,
    },
    {
      href: "/playground/reactive",
      eyebrow: $t`Reactive`,
      title: $t`$t with rune-backed state from a .svelte.ts module`,
      body: $t`Covers top-level reactive strings, callback contexts, and module-owned state.`,
    },
    {
      href: "/playground/syntax",
      eyebrow: $t`Syntax`,
      title: $t`$t across Svelte syntax positions`,
      body: $t`Covers @const, attributes, snippets, keyed blocks, and other expression sites.`,
    },
    {
      href: "/playground/rich-text",
      eyebrow: $t`Rich text`,
      title: $t`Embedded elements and components inside Trans`,
      body: $t`Covers placeholder parsing and runtime rendering of translated rich text.`,
    },
    {
      href: "/playground/components",
      eyebrow: $t`Components`,
      title: $t`Plural, Select, and SelectOrdinal component macros`,
      body: $t`Covers ICU component syntax with interactive values.`,
    },
    {
      href: "/playground/ids",
      eyebrow: $t`Explicit ids`,
      title: $t`Small, isolated cases for ids, comments, and contexts`,
      body: $t`Keeps explicit-id coverage available without turning the whole app into test code.`,
    },
    {
      href: "/playground/init-preloaded",
      eyebrow: $t`Init: Preloaded`,
      title: $t`All locales loaded at init, activate() only`,
      body: $t`setupI18n with a full messages map. Switching locales calls activate() without a preceding load().`,
    },
    {
      href: "/playground/init-lazy",
      eyebrow: $t`Init: Lazy`,
      title: $t`Empty init, load each locale on demand`,
      body: $t`setupI18n() with no arguments. loadAndActivate() loads and switches one locale at a time.`,
    },
    {
      href: "/playground/init-isolated",
      eyebrow: $t`Init: Isolated`,
      title: $t`Child component with its own fixed i18n context`,
      body: $t`A nested component calls setLinguiContext with an independent instance. Its subtree ignores the parent locale.`,
    },
  ];
</script>

<section class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
  <div class="contents">
    {#each sections as section}
      <a
        class="card border-base-300 bg-base-100 border shadow-md transition hover:-translate-y-1 hover:shadow-xl"
        href={section.href}
      >
        <div class="card-body gap-3">
          <p
            class="text-secondary text-xs font-semibold tracking-[0.25em] uppercase"
          >
            {section.eyebrow}
          </p>
          <h2 class="card-title text-2xl">{section.title}</h2>
          <p class="text-base-content/75">{section.body}</p>
        </div>
      </a>
    {/each}
  </div>
</section>
