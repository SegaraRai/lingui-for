<svelte:options runes={true} />

<script lang="ts">
  import { RuntimeTrans as L4sRuntimeTrans, createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
  const __l4s_ctx = createLinguiAccessors();
  const __l4s_getI18n = __l4s_ctx.getI18n;
  const __l4s_translate = __l4s_ctx._;
  type AlertLevel = "info" | "warn" | "error";
  type QueueRegion = "amer" | "apac" | "emea";
  type QueuePriority = "low" | "medium" | "high";
  type QueueKind = "overview" | "queue" | "review" | "history";

  type TeamCard = {
    badge: string;
    id: string;
    label: string;
    pending: number;
    reviewed: number;
    flagged: number;
    reviewers: number;
  };

  type QueueItem = {
    assignee: string;
    attachments: number;
    comments: number;
    id: string;
    kind: QueueKind;
    owner: string;
    pathHint: string | null;
    priority: QueuePriority;
    region: QueueRegion;
    title: string;
    unread: number;
  };

  type DecisionRow = {
    changedBy: string;
    id: string;
    label: string;
    path: string | null;
    state: "queued" | "active" | "done";
  };

  type ActivityEntry = {
    actor: string;
    id: string;
    summary: string;
    timeLabel: string;
  };

  const dashboardOwner = $state("Mina Chen");
  const localeMode = $state<"en" | "ja" | "fr">("en");
  const selectedRegion = $state<QueueRegion | "all">("all");
  const selectedKind = $state<QueueKind | "all">("all");
  const showAssignedOnly = $state(false);
  const showHistory = $state(true);
  const page = $state(1);
  const pageSize = 6;
  const workspaceWritable = $state(true);
  const latencyMs = $state(184);
  const htmlDigest =
    "<strong>Imported digest</strong> with <em>inline</em> reviewer highlights.";

  const teamCards = $state<TeamCard[]>([
    {
      badge: "A",
      id: "amer-core",
      label: "Americas Core Review",
      pending: 12,
      reviewed: 31,
      flagged: 1,
      reviewers: 8,
    },
    {
      badge: "B",
      id: "emea-ops",
      label: "EMEA Operations",
      pending: 16,
      reviewed: 29,
      flagged: 2,
      reviewers: 11,
    },
    {
      badge: "C",
      id: "apac-specialists",
      label: "APAC Specialists",
      pending: 10,
      reviewed: 21,
      flagged: 1,
      reviewers: 7,
    },
    {
      badge: "D",
      id: "archive",
      label: "Archive Sweep",
      pending: 7,
      reviewed: 15,
      flagged: 0,
      reviewers: 5,
    },
    {
      badge: "E",
      id: "quality",
      label: "Quality Escalations",
      pending: 8,
      reviewed: 11,
      flagged: 4,
      reviewers: 6,
    },
    {
      badge: "F",
      id: "catalog",
      label: "Catalog Integrity",
      pending: 13,
      reviewed: 19,
      flagged: 3,
      reviewers: 9,
    },
    {
      badge: "G",
      id: "imports",
      label: "Importer Reliability",
      pending: 9,
      reviewed: 14,
      flagged: 2,
      reviewers: 5,
    },
    {
      badge: "H",
      id: "runtime",
      label: "Runtime Lowering",
      pending: 6,
      reviewed: 13,
      flagged: 1,
      reviewers: 4,
    },
  ]);

  const queueItems = $state<QueueItem[]>([
    {
      assignee: "Mina Chen",
      attachments: 4,
      comments: 12,
      id: "Q-1001",
      kind: "overview",
      owner: "Ari Patel",
      pathHint: "/amer/overview.md",
      priority: "high",
      region: "amer",
      title: "Audit product overview translations",
      unread: 3,
    },
    {
      assignee: "Lina Sato",
      attachments: 1,
      comments: 7,
      id: "Q-1002",
      kind: "review",
      owner: "Mika Laurent",
      pathHint: "/apac/fallbacks.md",
      priority: "medium",
      region: "apac",
      title: "Validate fallback notices for regional bundles",
      unread: 0,
    },
    {
      assignee: "Mina Chen",
      attachments: 3,
      comments: 18,
      id: "Q-1003",
      kind: "queue",
      owner: "Jules Ortega",
      pathHint: "/emea/queue/reconcile.md",
      priority: "high",
      region: "emea",
      title: "Reconcile stale queue annotations in importer",
      unread: 5,
    },
    {
      assignee: "Theo Brandt",
      attachments: 0,
      comments: 3,
      id: "Q-1004",
      kind: "history",
      owner: "Nora Singh",
      pathHint: null,
      priority: "low",
      region: "amer",
      title: "Archive weekly translation snapshot labels",
      unread: 0,
    },
    {
      assignee: "Mina Chen",
      attachments: 2,
      comments: 9,
      id: "Q-1005",
      kind: "review",
      owner: "Sven Keller",
      pathHint: "/emea/runtime/warnings.md",
      priority: "high",
      region: "emea",
      title: "Review editor warnings for malformed descriptors",
      unread: 2,
    },
    {
      assignee: "Lina Sato",
      attachments: 5,
      comments: 13,
      id: "Q-1006",
      kind: "overview",
      owner: "Ivy Morales",
      pathHint: "/apac/previews/rich-text.md",
      priority: "medium",
      region: "apac",
      title: "Audit import previews for rich-text fragments",
      unread: 4,
    },
    {
      assignee: "Theo Brandt",
      attachments: 1,
      comments: 6,
      id: "Q-1007",
      kind: "queue",
      owner: "Ari Patel",
      pathHint: "/amer/queue/confidence.md",
      priority: "medium",
      region: "amer",
      title: "Sort pending descriptors by confidence window",
      unread: 1,
    },
    {
      assignee: "Mina Chen",
      attachments: 6,
      comments: 25,
      id: "Q-1008",
      kind: "review",
      owner: "Nora Singh",
      pathHint: "/emea/runtime/nested.md",
      priority: "high",
      region: "emea",
      title: "Investigate nested expression output drift",
      unread: 7,
    },
    {
      assignee: "Mina Chen",
      attachments: 0,
      comments: 2,
      id: "Q-1009",
      kind: "history",
      owner: "Sven Keller",
      pathHint: "/apac/history/snapshots.md",
      priority: "low",
      region: "apac",
      title: "Rotate history snapshots for viewer diagnostics",
      unread: 0,
    },
    {
      assignee: "Lina Sato",
      attachments: 2,
      comments: 11,
      id: "Q-1010",
      kind: "overview",
      owner: "Mika Laurent",
      pathHint: "/amer/reports/warnings.md",
      priority: "medium",
      region: "amer",
      title: "Normalize warning banners in report exports",
      unread: 1,
    },
    {
      assignee: "Theo Brandt",
      attachments: 8,
      comments: 29,
      id: "Q-1011",
      kind: "queue",
      owner: "Jules Ortega",
      pathHint: "/emea/backfill/metadata.md",
      priority: "high",
      region: "emea",
      title: "Backfill descriptor metadata for old sessions",
      unread: 9,
    },
    {
      assignee: "Mina Chen",
      attachments: 3,
      comments: 15,
      id: "Q-1012",
      kind: "review",
      owner: "Ivy Morales",
      pathHint: "/apac/interpolation/compare.md",
      priority: "medium",
      region: "apac",
      title: "Compare interpolation warnings across locales",
      unread: 2,
    },
    {
      assignee: "Lina Sato",
      attachments: 3,
      comments: 10,
      id: "Q-1013",
      kind: "queue",
      owner: "Ari Patel",
      pathHint: "/amer/migration/messages.md",
      priority: "high",
      region: "amer",
      title: "Backfill migration notes for source bundles",
      unread: 4,
    },
    {
      assignee: "Theo Brandt",
      attachments: 4,
      comments: 8,
      id: "Q-1014",
      kind: "overview",
      owner: "Mika Laurent",
      pathHint: "/emea/overview/reviewers.md",
      priority: "low",
      region: "emea",
      title: "Refresh reviewer roster metadata",
      unread: 0,
    },
    {
      assignee: "Mina Chen",
      attachments: 7,
      comments: 17,
      id: "Q-1015",
      kind: "review",
      owner: "Ivy Morales",
      pathHint: "/apac/quality/runtime.md",
      priority: "high",
      region: "apac",
      title: "Audit runtime lowering changes for quality board",
      unread: 6,
    },
    {
      assignee: "Lina Sato",
      attachments: 1,
      comments: 5,
      id: "Q-1016",
      kind: "history",
      owner: "Nora Singh",
      pathHint: "/archive/monthly/summary.md",
      priority: "medium",
      region: "amer",
      title: "Review archive summary banner copy",
      unread: 0,
    },
  ]);

  const decisionRows = $state<DecisionRow[]>([
    {
      changedBy: "Ari Patel",
      id: "D-01",
      label: "Queued overview review packet",
      path: "/amer/overview.md",
      state: "queued",
    },
    {
      changedBy: "Mika Laurent",
      id: "D-02",
      label: "Attached screenshot annotations",
      path: "/emea/screenshots.md",
      state: "active",
    },
    {
      changedBy: "Mina Chen",
      id: "D-03",
      label: "Resolved nested expression warning",
      path: "/runtime/nested.md",
      state: "done",
    },
    {
      changedBy: "Theo Brandt",
      id: "D-04",
      label: "Queued archive reconciliation",
      path: null,
      state: "queued",
    },
    {
      changedBy: "Nora Singh",
      id: "D-05",
      label: "Reviewed exported fallback summary",
      path: "/exports/fallback-summary.md",
      state: "active",
    },
    {
      changedBy: "Lina Sato",
      id: "D-06",
      label: "Resolved duplicate message banner",
      path: "/quality/messages.md",
      state: "done",
    },
    {
      changedBy: "Sven Keller",
      id: "D-07",
      label: "Queued batch viewer diagnostics",
      path: "/viewer/diagnostics.md",
      state: "queued",
    },
    {
      changedBy: "Ivy Morales",
      id: "D-08",
      label: "Reviewed queue escalation policy",
      path: "/quality/escalations.md",
      state: "active",
    },
  ]);

  const activity = $state<ActivityEntry[]>([
    {
      actor: "Mina Chen",
      id: "A-01",
      summary: "Accepted 14 descriptor updates for EMEA Operations.",
      timeLabel: "2m ago",
    },
    {
      actor: "Theo Brandt",
      id: "A-02",
      summary: "Requeued historical viewer diagnostics for archive sweep.",
      timeLabel: "11m ago",
    },
    {
      actor: "Lina Sato",
      id: "A-03",
      summary:
        "Flagged one malformed template interpolation in APAC Specialists.",
      timeLabel: "26m ago",
    },
    {
      actor: "Nora Singh",
      id: "A-04",
      summary: "Resolved fallback mismatch between bundle and queue snapshot.",
      timeLabel: "41m ago",
    },
    {
      actor: "Sven Keller",
      id: "A-05",
      summary: "Reassigned archive summary work to the overview rotation.",
      timeLabel: "53m ago",
    },
    {
      actor: "Ivy Morales",
      id: "A-06",
      summary:
        "Recorded a runtime regression candidate for nested descriptor values.",
      timeLabel: "1h ago",
    },
  ]);

  const alertLevel = $derived<AlertLevel>(
    $queueItems.some((item) => item.priority === "high" && item.unread > 6)
      ? "error"
      : $queueItems.some((item) => item.priority === "high")
        ? "warn"
        : "info",
  );

  const filteredQueue = $derived(
    $queueItems.filter((item) => {
      const regionOk =
        selectedRegion === "all" || item.region === selectedRegion;
      const kindOk = selectedKind === "all" || item.kind === selectedKind;
      const assigneeOk = !showAssignedOnly || item.assignee === dashboardOwner;
      const historyOk = showHistory || item.kind !== "history";
      return regionOk && kindOk && assigneeOk && historyOk;
    }),
  );

  const pagedQueue = $derived.by(() => {
    const start = (page - 1) * pageSize;
    return filteredQueue.slice(start, start + pageSize);
  });

  const highlightedQueue = $derived(
    filteredQueue.filter((item) =>
      item.priority === "high"
        ? item.unread > 0
        : item.comments > 10 &&
          (item.unread > 0 || (item.pathHint ?? "").length > 10),
    ),
  );

  const totals = $derived({
    attachments: filteredQueue.reduce((sum, item) => sum + item.attachments, 0),
    comments: filteredQueue.reduce((sum, item) => sum + item.comments, 0),
    unread: filteredQueue.reduce((sum, item) => sum + item.unread, 0),
  });

  const ownerGreeting = $derived($__l4s_translate(
  /*i18n*/ {
    id: "8+nA3Y",
    message: "Welcome back, {dashboardOwner}.",
    values: {
      dashboardOwner: dashboardOwner
    }
  }));
  const queueSummary = $derived(
    $__l4s_translate(
    /*i18n*/ {
      id: "5kwh2a",
      message: "Showing {0} queue items for {1}.",
      values: {
        0: String(filteredQueue.length),
        1: selectedRegion === "all" ? "all regions" : selectedRegion
      }
    }),
  );
  const workflowLabel = $derived(
    $__l4s_translate(
    /*i18n*/ {
      id: "wc9bP7",
      message: "{localeMode, select, en {English workflow} ja {Japanese workflow} fr {French workflow} other {Fallback workflow}}",
      values: {
        localeMode: localeMode
      }
    }),
  );
  const statusBanner = $derived(
    alertLevel === "error"
      ? $__l4s_translate(
      /*i18n*/ {
        id: "C81jcY",
        message: "Escalation required: unresolved high-priority queue items remain."
      })
      : alertLevel === "warn"
        ? $__l4s_translate(
        /*i18n*/ {
          id: "jJ+oTf",
          message: "Attention needed: high-priority items are waiting for review."
        })
        : $__l4s_translate(
        /*i18n*/ {
          id: "GzY8qo",
          message: "All monitored queues are stable."
        }),
  );
  const latencyLabel = $derived(
    $__l4s_translate(
    /*i18n*/ {
      id: "lC/3w5",
      message: "Live snapshot latency: {0}.",
      values: {
        0: String(latencyMs > 250 ? `${latencyMs}ms (slow)` : `${latencyMs}ms`)
      }
    }),
  );

  function priorityTone(priority: QueuePriority): string {
    return priority === "high"
      ? "text-red-600"
      : priority === "medium"
        ? "text-amber-600"
        : "text-slate-600";
  }

  function rowTone(state: DecisionRow["state"]): string {
    return state === "done"
      ? "bg-emerald-100 text-emerald-700"
      : state === "active"
        ? "bg-sky-100 text-sky-700"
        : "bg-slate-100 text-slate-700";
  }

  __l4s_ctx.prime();
</script>

<div class="mx-auto grid max-w-7xl gap-8 px-6 py-8">
  <header
    class="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="grid gap-2">
        <p
          class="text-sm font-medium tracking-[0.24em] text-slate-500 uppercase"
        >
          {$__l4s_translate(
          /*i18n*/ {
            id: "B1MDds",
            message: "Operations"
          })}
        </p>
        <h1 class="text-3xl font-semibold text-slate-950">{ownerGreeting}</h1>
        <p class="max-w-3xl text-sm leading-6 text-slate-600">{queueSummary}</p>
      </div>
      <div class="grid min-w-64 gap-2 rounded-2xl bg-slate-50 p-4">
        <p class="text-sm font-medium text-slate-700">{statusBanner}</p>
        <p class="text-xs text-slate-500">{latencyLabel}</p>
        <p class="text-xs text-slate-500">
          {$__l4s_translate(
          /*i18n*/ {
            id: "xdDw1Z",
            message: "Workspace mode:"
          })}
          {workflowLabel}
        </p>
        <p class="text-xs text-slate-500">
          {workspaceWritable
            ? $__l4s_translate(
            /*i18n*/ {
              id: "5wic0R",
              message: "Editing tools are enabled for this workspace."
            })
            : $__l4s_translate(
            /*i18n*/ {
              id: "oYLtG0",
              message: "Editing tools are read-only for this workspace."
            })}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-3 text-sm">
      <span class="rounded-full border px-3 py-2"
        >{$__l4s_translate(
        /*i18n*/ {
          id: "tQcxxg",
          message: "Region:"
        })} {selectedRegion}</span
      >
      <span class="rounded-full border px-3 py-2"
        >{$__l4s_translate(
        /*i18n*/ {
          id: "7lRCx1",
          message: "Queue kind:"
        })} {selectedKind}</span
      >
      <span class="rounded-full border px-3 py-2">
        {$__l4s_translate(
        /*i18n*/ {
          id: "gzWinp",
          message: "Assigned only:"
        })}
        {showAssignedOnly ? $__l4s_translate(
        /*i18n*/ {
          id: "Fdp03t",
          message: "on"
        }) : $__l4s_translate(
        /*i18n*/ {
          id: "Bdtwnw",
          message: "off"
        })}
      </span>
      <span class="rounded-full border px-3 py-2">
        {$__l4s_translate(
        /*i18n*/ {
          id: "jYKshG",
          message: "History:"
        })}
        {showHistory ? $__l4s_translate(
        /*i18n*/ {
          id: "JkIYli",
          message: "shown"
        }) : $__l4s_translate(
        /*i18n*/ {
          id: "zNCBmf",
          message: "hidden"
        })}
      </span>
    </div>
  </header>

  <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    {#each $teamCards as card (card.id)}
      <article
        class="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="grid gap-1">
            <h2 class="text-base font-semibold text-slate-950">{card.label}</h2>
            <p class="text-xs text-slate-500">
              {$__l4s_translate(
              /*i18n*/ {
                id: "W3Ae0L",
                message: "{0} active reviewers available.",
                values: {
                  0: String(card.reviewers)
                }
              })}
            </p>
          </div>
          <p class="text-xs tracking-[0.2em] text-slate-400 uppercase">
            {card.badge}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm text-slate-700">
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="text-xs tracking-[0.18em] text-slate-500 uppercase">
              {$__l4s_translate(
              /*i18n*/ {
                id: "UbRKMZ",
                message: "Pending"
              })}
            </p>
            <p class="mt-2 text-2xl font-semibold text-slate-950">
              {card.pending}
            </p>
          </div>
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="text-xs tracking-[0.18em] text-slate-500 uppercase">
              {$__l4s_translate(
              /*i18n*/ {
                id: "FEPXtw",
                message: "Reviewed"
              })}
            </p>
            <p class="mt-2 text-2xl font-semibold text-slate-950">
              {card.reviewed}
            </p>
          </div>
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="text-xs tracking-[0.18em] text-slate-500 uppercase">
              {$__l4s_translate(
              /*i18n*/ {
                id: "3UYUtA",
                message: "Flagged"
              })}
            </p>
            <p class="mt-2 text-2xl font-semibold text-slate-950">
              {card.flagged}
            </p>
          </div>
          <div class="rounded-2xl bg-slate-50 p-3">
            <p class="text-xs tracking-[0.18em] text-slate-500 uppercase">
              {$__l4s_translate(
              /*i18n*/ {
                id: "yiNL80",
                message: "Reviewers"
              })}
            </p>
            <p class="mt-2 text-2xl font-semibold text-slate-950">
              {card.reviewers}
            </p>
          </div>
        </div>
      </article>
    {/each}
  </section>

  <section class="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
    <div
      class="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold text-slate-950">
            {$__l4s_translate(
            /*i18n*/ {
              id: "mtE2Ev",
              message: "Queue details"
            })}
          </h2>
          <p class="text-sm text-slate-500">
            {$__l4s_translate(
            /*i18n*/ {
              id: "gimT52",
              message: "{0} items match the current filters.",
              values: {
                0: String(filteredQueue.length)
              }
            })}
          </p>
        </div>
        <p class="text-sm text-slate-500">
          {$__l4s_translate(
          /*i18n*/ {
            id: "Ji1wwM",
            message: "Attachments {0}, comments {1}, unread {2}.",
            values: {
              0: String($totals.attachments),
              1: String($totals.comments),
              2: String($totals.unread)
            }
          })}
        </p>
      </div>

      <div class="grid gap-3">
        {#each $pagedQueue as item (item.id)}
          {@const nestedLabel =
            item.unread > 0
              ? $__l4s_translate(
              /*i18n*/ {
                id: "szWjCj",
                message: "{0} left {1} comments while {2} still has {3} unread updates.",
                values: {
                  0: item.owner,
                  1: String(item.comments),
                  2: item.assignee,
                  3: String(item.unread)
                }
              })
              : $__l4s_translate(
              /*i18n*/ {
                id: "IDpMOo",
                message: "{0} left {1} comments and the queue is fully read.",
                values: {
                  0: item.owner,
                  1: String(item.comments)
                }
              })}

          <article class="grid gap-3 rounded-2xl border border-slate-200 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="grid gap-1">
                <h3 class="text-base font-semibold text-slate-950">
                  {item.title}
                </h3>
                <p class="text-sm text-slate-500">{nestedLabel}</p>
              </div>
              <p class={`text-sm font-semibold ${priorityTone(item.priority)}`}>
                {item.priority.toUpperCase()}
              </p>
            </div>

            <div class="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <p>{$__l4s_translate(
              /*i18n*/ {
                id: "2TUOis",
                message: "Owner:"
              })} {item.owner}</p>
              <p>{$__l4s_translate(
              /*i18n*/ {
                id: "GRmQfp",
                message: "Assignee:"
              })} {item.assignee}</p>
              <p>{$__l4s_translate(
              /*i18n*/ {
                id: "Y2+ZT9",
                message: "Comments:"
              })} {item.comments}</p>
              <p>{$__l4s_translate(
              /*i18n*/ {
                id: "jqmIfA",
                message: "Attachments:"
              })} {item.attachments}</p>
            </div>

            <div class="flex flex-wrap gap-3 text-sm text-slate-600">
              <span class="rounded-full bg-slate-100 px-3 py-1">{item.id}</span>
              <span class="rounded-full bg-slate-100 px-3 py-1"
                >{item.region}</span
              >
              <span class="rounded-full bg-slate-100 px-3 py-1"
                >{item.kind}</span
              >
              {#if item.pathHint}
                <span class="rounded-full bg-slate-100 px-3 py-1">
                  {$__l4s_translate(
                  /*i18n*/ {
                    id: "lvcfoy",
                    message: "Path {0}",
                    values: {
                      0: String(item.pathHint ?? "")
                    }
                  })}
                </span>
              {:else}
                <span class="rounded-full bg-slate-100 px-3 py-1">
                  {$__l4s_translate(
                  /*i18n*/ {
                    id: "pa6gX+",
                    message: "No path"
                  })}
                </span>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </div>

    <div class="grid gap-4">
      <section
        class="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-semibold text-slate-950">
            {$__l4s_translate(
            /*i18n*/ {
              id: "qbgW+C",
              message: "Highlights"
            })}
          </h2>
          <p class="text-sm text-slate-500">
            {$__l4s_translate(
            /*i18n*/ {
              id: "ubwhkQ",
              message: "{0} items need attention.",
              values: {
                0: String($highlightedQueue.length)
              }
            })}
          </p>
        </div>

        {#if $highlightedQueue.length === 0}
          <p class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            {$__l4s_translate(
            /*i18n*/ {
              id: "nj0sbN",
              message: "No highlighted queue items."
            })}
          </p>
        {:else}
          <ul class="grid gap-3">
            {#each $highlightedQueue as item (item.id)}
              <li class="rounded-2xl bg-slate-50 p-4">
                <p class="text-sm font-medium text-slate-900">{item.title}</p>
                <p class="mt-1 text-xs text-slate-500">
                  {$__l4s_translate(
                  /*i18n*/ {
                    id: "i4y9D/",
                    message: "{0} assigned {1} with {2} comments and {3} unread changes.",
                    values: {
                      0: item.owner,
                      1: item.assignee,
                      2: String(item.comments),
                      3: String(item.unread)
                    }
                  })}
                </p>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section
        class="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 class="text-xl font-semibold text-slate-950">
          {$__l4s_translate(
          /*i18n*/ {
            id: "quM66o",
            message: "Decision log"
          })}
        </h2>
        <ol class="grid gap-3">
          {#each $decisionRows as row (row.id)}
            <li class="grid gap-2 rounded-2xl border border-slate-100 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-slate-900">{row.label}</p>
                <span
                  class={`rounded-full px-3 py-1 text-xs ${rowTone(row.state)}`}
                >
                  {row.state}
                </span>
              </div>
              <p class="text-xs text-slate-500">
                {$__l4s_translate(
                /*i18n*/ {
                  id: "LZB4fD",
                  message: "{0} updated {1} during this step.",
                  values: {
                    0: row.changedBy,
                    1: String(row.path ?? "the current workflow")
                  }
                })}
              </p>
            </li>
          {/each}
        </ol>
      </section>
    </div>
  </section>

  <section class="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
    <div
      class="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 class="text-xl font-semibold text-slate-950">
        {$__l4s_translate(
        /*i18n*/ {
          id: "OcCQjb",
          message: "Activity stream"
        })}
      </h2>
      <ul class="grid gap-3">
        {#each $activity as entry (entry.id)}
          <li class="grid gap-1 rounded-2xl bg-slate-50 p-4">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium text-slate-900">{entry.actor}</p>
              <p class="text-xs text-slate-500">{entry.timeLabel}</p>
            </div>
            <p class="text-sm text-slate-600">{entry.summary}</p>
          </li>
        {/each}
      </ul>

      <div class="rounded-2xl border border-dashed border-slate-200 p-4">
        <p class="text-sm text-slate-600">
          <L4sRuntimeTrans />
        </p>
        <p>
          <L4sRuntimeTrans />
        </p>
        <div>
          <L4sRuntimeTrans />
        </div>
      </div>
    </div>

    <aside
      class="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 class="text-xl font-semibold text-slate-950">
        {$__l4s_translate(
        /*i18n*/ {
          id: "UsgvkK",
          message: "Status digest"
        })}
      </h2>
      <L4sRuntimeTrans value={$highlightedQueue.length} one={__l4s_getI18n()._(
      /*i18n*/ {
        id: "s0sXxO",
        message: "There is one highlighted queue item."
      })} other={__l4s_getI18n()._(
      /*i18n*/ {
        id: "J4w9XN",
        message: "There are {0} highlighted queue items.",
        values: {
          0: String($highlightedQueue.length)
        }
      })} />
      <p class="text-sm text-slate-600">
        {$__l4s_translate(
        /*i18n*/ {
          id: "pnokNm",
          message: "The queue is {0} and {1}.",
          values: {
            0: String(filteredQueue.length > 8 ? "very busy" : "manageable"),
            1: String($highlightedQueue.length > 2 ? "requires escalation" : "is within normal review limits")
          }
        })}
      </p>
      <p class="text-sm text-slate-600">
        {$__l4s_translate(
        /*i18n*/ {
          id: "d8ajL9",
          message: "Nested expression summary: {0}.",
          values: {
            0: String($highlightedQueue.length > 0 ? `highlighted:${$highlightedQueue[0]?.id ?? "none"}` : `region:${selectedRegion}`)
          }
        })}
      </p>
    </aside>
  </section>
</div>
