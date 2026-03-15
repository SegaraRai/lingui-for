<script lang="ts">
  import { t, Plural, Select, SelectOrdinal } from "lingui-for-svelte/macro";

  let count = $state(2);
  let role = $state("other");
</script>

<section class="card border border-base-300 bg-base-100 shadow-lg">
  <div class="card-body gap-5">
    <p class="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
      {$t`Components`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">{$t`ICU component macros`}</h1>
    <p class="text-base-content/80">
      {$t`Plural, Select, and SelectOrdinal keep branch-heavy messages readable inside markup.`}
    </p>

    <div class="flex flex-wrap gap-3">
      <button
        class="btn btn-outline btn-primary"
        onclick={() => (count = Math.max(0, count - 1))}
        type="button"
      >
        {$t`Decrease`}
      </button>
      <button class="btn btn-primary" onclick={() => (count += 1)} type="button">
        {$t`Increase`}
      </button>
      <button
        class="btn btn-secondary"
        onclick={() => (role = role === "female" ? "other" : "female")}
        type="button"
      >
        {$t`Toggle role`}
      </button>
    </div>

    <div class="space-y-3 text-lg">
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
