<script lang="ts">
  import { t, Trans } from "lingui-for-svelte/macro";
</script>

<section class="hero rounded-box border-base-300 bg-base-100 border shadow-xl">
  <div class="hero-content items-start px-6 py-10 md:px-10">
    <div class="space-y-5">
      <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
        {$t`Real app`}
      </p>
      <h1 class="text-5xl leading-tight font-black md:text-7xl">
        {$t`Lingui in a small SvelteKit application`}
      </h1>
      <p class="text-base-content/80 text-lg md:text-xl">
        {$t`This example keeps locale state in a real app shell and moves library verification into isolated playground routes.`}
      </p>
      <p class="text-base-content/80 text-base md:text-lg">
        <Trans>
          Open <a href="/settings" class="link link-primary">Settings</a> to
          change your language or visit the <strong>playground</strong> for macro-specific
          checks.
        </Trans>
      </p>
    </div>
  </div>
</section>

<section class="grid gap-4 lg:grid-cols-3">
  <article class="card border-base-300 bg-base-100 border shadow-md">
    <div class="card-body gap-3">
      <p
        class="text-secondary text-xs font-semibold tracking-[0.25em] uppercase"
      >
        {$t`Locale session`}
      </p>
      <h2 class="card-title text-2xl">
        {$t`The server remembers your preferred language`}
      </h2>
      <p class="text-base-content/75">
        {$t`Switch languages from the header and the next route keeps the same locale.`}
      </p>
    </div>
  </article>
  <article class="card border-base-300 bg-base-100 border shadow-md">
    <div class="card-body gap-3">
      <p
        class="text-secondary text-xs font-semibold tracking-[0.25em] uppercase"
      >
        {$t`Direct usage`}
      </p>
      <h2 class="card-title text-2xl">
        {$t`Messages live next to the code that renders them`}
      </h2>
      <p class="text-base-content/75">
        {$t`Pages and components call Lingui macros directly instead of pulling copy from a central message file.`}
      </p>
    </div>
  </article>
  <article class="card border-base-300 bg-base-100 border shadow-md">
    <div class="card-body gap-3">
      <p
        class="text-secondary text-xs font-semibold tracking-[0.25em] uppercase"
      >
        {$t`Playground`}
      </p>
      <h2 class="card-title text-2xl">
        {$t`Library-specific checks stay out of the main app flow`}
      </h2>
      <p class="text-base-content/75">
        {$t`Dedicated playground routes cover reactive macros, rich text, ICU components, and explicit id variants.`}
      </p>
    </div>
  </article>
</section>
