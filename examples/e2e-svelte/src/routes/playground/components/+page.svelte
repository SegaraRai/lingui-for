<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t, Plural, Select, SelectOrdinal } from "lingui-for-svelte/macro";

  let count = $state(2);
  let role = $state("other");
</script>

<section {...style("card bg-base-100 border border-base-300 shadow-lg")}>
  <div {...style("card-body gap-5")}>
    <p
      {...style(
        "text-primary text-sm font-semibold tracking-[0.3em] uppercase",
      )}
    >
      {$t`Components`}
    </p>
    <h1 {...style("font-black text-4xl md:text-5xl")}>
      {$t`ICU component macros`}
    </h1>
    <p {...style("text-base-content/80")}>
      {$t`Plural, Select, and SelectOrdinal keep branch-heavy messages readable inside markup.`}
    </p>

    <div {...style("flex flex-wrap gap-3")}>
      <button
        {...style("btn btn-outline btn-primary")}
        onclick={() => (count = Math.max(0, count - 1))}
        type="button"
      >
        {$t`Decrease`}
      </button>
      <button
        {...style("btn btn-primary")}
        onclick={() => (count += 1)}
        type="button"
      >
        {$t`Increase`}
      </button>
      <button
        {...style("btn btn-secondary")}
        onclick={() => (role = role === "female" ? "other" : "female")}
        type="button"
      >
        {$t`Toggle role`}
      </button>
    </div>

    <div {...style("space-y-3 text-lg")}>
      <p>
        <Plural
          value={count}
          one="# component task is queued"
          other="# component tasks are queued"
        />
      </p>
      <p>
        <Select
          value={role}
          _female="She approves the locale switch."
          other="They approve the locale switch."
        />
      </p>
      <p>
        <SelectOrdinal
          value={count}
          one="#st release candidate"
          two="#nd release candidate"
          few="#rd release candidate"
          other="#th release candidate"
        />
      </p>
    </div>
  </div>
</section>
