<script lang="ts">
  import {
    Plural,
    plural,
    SelectOrdinal,
    selectOrdinal,
    select,
    t,
  } from "lingui-for-svelte/macro";

  let count = $state(0);
  let rank = $state(1);
  let role = $state("admin");
</script>

<section class="card border-base-300 bg-base-100 border shadow-lg">
  <div class="card-body gap-5">
    <p class="text-primary text-sm font-semibold tracking-[0.3em] uppercase">
      {$t`Stress`}
    </p>
    <h1 class="text-4xl font-black md:text-5xl">
      {$t`Exact-number branches and deep macro trees`}
    </h1>

    <div class="flex flex-wrap gap-3">
      <button
        class="btn btn-outline btn-primary"
        data-testid="count-0"
        onclick={() => (count = 0)}
        type="button"
      >
        count = 0
      </button>
      <button
        class="btn btn-outline btn-primary"
        data-testid="count-2"
        onclick={() => (count = 2)}
        type="button"
      >
        count = 2
      </button>
      <button
        class="btn btn-outline btn-primary"
        data-testid="count-5"
        onclick={() => (count = 5)}
        type="button"
      >
        count = 5
      </button>
      <button
        class="btn btn-outline btn-secondary"
        data-testid="rank-1"
        onclick={() => (rank = 1)}
        type="button"
      >
        rank = 1
      </button>
      <button
        class="btn btn-outline btn-secondary"
        data-testid="rank-2"
        onclick={() => (rank = 2)}
        type="button"
      >
        rank = 2
      </button>
      <button
        class="btn btn-outline btn-secondary"
        data-testid="rank-4"
        onclick={() => (rank = 4)}
        type="button"
      >
        rank = 4
      </button>
      <button
        class="btn btn-outline btn-accent"
        data-testid="role-admin"
        onclick={() => (role = "admin")}
        type="button"
      >
        admin
      </button>
      <button
        class="btn btn-outline btn-accent"
        data-testid="role-other"
        onclick={() => (role = "other")}
        type="button"
      >
        other
      </button>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <article class="card border-base-300 bg-base-200 border">
        <div class="card-body gap-3">
          <h2 class="card-title text-2xl">Exact-number branches</h2>
          <p data-testid="core-exact-plural">
            {$plural(count, {
              0: "no queued builds",
              2: "exactly two queued builds",
              other: "# queued builds",
            })}
          </p>
          <p data-testid="core-exact-ordinal">
            {$selectOrdinal(rank, {
              1: "take the shortcut",
              2: "take the scenic route",
              other: "finish in #th place",
            })}
          </p>
          <p data-testid="component-exact-plural">
            <Plural
              value={count}
              _0="no queued builds"
              _2="exactly two queued builds"
              other="# queued builds"
            />
          </p>
          <p data-testid="component-exact-ordinal">
            <SelectOrdinal
              value={rank}
              _1="take the shortcut"
              _2="take the scenic route"
              other="finish in #th place"
            />
          </p>
        </div>
      </article>

      <article class="card border-base-300 bg-base-200 border">
        <div class="card-body gap-3">
          <h2 class="card-title text-2xl">Deep macro trees</h2>
          <p data-testid="deep-core">
            {$t({
              message: plural(count, {
                0: selectOrdinal(rank, {
                  1: select(role, {
                    admin: "core zero first admin",
                    other: "core zero first other",
                  }),
                  2: select(role, {
                    admin: "core zero second admin",
                    other: "core zero second other",
                  }),
                  other: select(role, {
                    admin: "core zero later admin",
                    other: "core zero later other",
                  }),
                }),
                2: selectOrdinal(rank, {
                  1: select(role, {
                    admin: "core two first admin",
                    other: "core two first other",
                  }),
                  2: select(role, {
                    admin: "core two second admin",
                    other: "core two second other",
                  }),
                  other: select(role, {
                    admin: "core two later admin",
                    other: "core two later other",
                  }),
                }),
                other: selectOrdinal(rank, {
                  1: select(role, {
                    admin: "core many first admin",
                    other: "core many first other",
                  }),
                  2: select(role, {
                    admin: "core many second admin",
                    other: "core many second other",
                  }),
                  other: select(role, {
                    admin: "core many later admin",
                    other: "core many later other",
                  }),
                }),
              }),
            })}
          </p>
          <p data-testid="deep-component">
            <Plural
              value={count}
              _0={selectOrdinal(rank, {
                1: select(role, {
                  admin: "component zero first admin",
                  other: "component zero first other",
                }),
                2: select(role, {
                  admin: "component zero second admin",
                  other: "component zero second other",
                }),
                other: select(role, {
                  admin: "component zero later admin",
                  other: "component zero later other",
                }),
              })}
              _2={selectOrdinal(rank, {
                1: select(role, {
                  admin: "component two first admin",
                  other: "component two first other",
                }),
                2: select(role, {
                  admin: "component two second admin",
                  other: "component two second other",
                }),
                other: select(role, {
                  admin: "component two later admin",
                  other: "component two later other",
                }),
              })}
              other={selectOrdinal(rank, {
                1: select(role, {
                  admin: "component many first admin",
                  other: "component many first other",
                }),
                2: select(role, {
                  admin: "component many second admin",
                  other: "component many second other",
                }),
                other: select(role, {
                  admin: "component many later admin",
                  other: "component many later other",
                }),
              })}
            />
          </p>
        </div>
      </article>
    </div>
  </div>
</section>
