<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t, Trans } from "lingui-for-svelte/macro";
</script>

<section
  {...style("hero rounded-box bg-base-100 border border-base-300 shadow-xl")}
>
  <div {...style("hero-content px-6 py-10 items-start md:px-10")}>
    <div {...style("space-y-5")}>
      <p
        {...style(
          "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
        )}
      >
        {$t`Real app`}
      </p>
      <h1 {...style("font-black text-5xl/tight md:text-7xl/tight")}>
        {$t`Lingui in a small SvelteKit application`}
      </h1>
      <p {...style("text-base-content/80 text-lg md:text-xl")}>
        {$t`This example keeps locale state in a real app shell and moves library verification into isolated playground routes.`}
      </p>
      <p {...style("text-base text-base-content/80 md:text-lg")}>
        <Trans>
          Open <a href="/settings" class="link link-primary">Settings</a> to
          change your language or visit the <strong>playground</strong> for macro-specific
          checks.
        </Trans>
      </p>
    </div>
  </div>
</section>

<section {...style("grid gap-4 lg:grid-cols-3")}>
  <article {...style("card bg-base-100 border border-base-300 shadow-md")}>
    <div {...style("card-body gap-3")}>
      <p
        {...style(
          "text-secondary text-xs font-semibold tracking-[0.25em] uppercase",
        )}
      >
        {$t`Locale session`}
      </p>
      <h2 {...style("card-title text-2xl")}>
        {$t`The server remembers your preferred language`}
      </h2>
      <p {...style("text-base-content/75")}>
        {$t`Switch languages from the header and the next route keeps the same locale.`}
      </p>
    </div>
  </article>
  <article {...style("card bg-base-100 border border-base-300 shadow-md")}>
    <div {...style("card-body gap-3")}>
      <p
        {...style(
          "text-secondary text-xs font-semibold tracking-[0.25em] uppercase",
        )}
      >
        {$t`Direct usage`}
      </p>
      <h2 {...style("card-title text-2xl")}>
        {$t`Messages live next to the code that renders them`}
      </h2>
      <p {...style("text-base-content/75")}>
        {$t`Pages and components call Lingui macros directly instead of pulling copy from a central message file.`}
      </p>
    </div>
  </article>
  <article {...style("card bg-base-100 border border-base-300 shadow-md")}>
    <div {...style("card-body gap-3")}>
      <p
        {...style(
          "text-secondary text-xs font-semibold tracking-[0.25em] uppercase",
        )}
      >
        {$t`Playground`}
      </p>
      <h2 {...style("card-title text-2xl")}>
        {$t`Library-specific checks stay out of the main app flow`}
      </h2>
      <p {...style("text-base-content/75")}>
        {$t`Dedicated playground routes cover reactive macros, rich text, ICU components, and explicit id variants.`}
      </p>
    </div>
  </article>
</section>
