import { i18n as _i18n } from "@lingui/core";
import { Trans as _Trans } from "@lingui/react";
const __lf_0 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "8+nA3Y",
  message: "Welcome back, {dashboardOwner}.",
  values: {
    dashboardOwner: dashboardOwner
  }
}), "translate");
const __lf_1 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "5kwh2a",
  message: "Showing {0} queue items for {1}.",
  values: {
    0: String(filteredQueue.length),
    1: selectedRegion === "all" ? "all regions" : selectedRegion
  }
}), "translate");
const __lf_2 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "wc9bP7",
  message: "{localeMode, select, en {English workflow} ja {Japanese workflow} fr {French workflow} other {Fallback workflow}}",
  values: {
    localeMode: localeMode
  }
}), "select");
const __lf_3 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "C81jcY",
  message: "Escalation required: unresolved high-priority queue items remain."
}), "translate");
const __lf_4 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "jJ+oTf",
  message: "Attention needed: high-priority items are waiting for review."
}), "translate");
const __lf_5 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "GzY8qo",
  message: "All monitored queues are stable."
}), "translate");
const __lf_6 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "lC/3w5",
  message: "Live snapshot latency: {0}.",
  values: {
    0: String(latencyMs > 250 ? `${latencyMs}ms (slow)` : `${latencyMs}ms`)
  }
}), "translate");
const __lf_7 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "B1MDds",
  message: "Operations"
}), "translate");
const __lf_8 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "xdDw1Z",
  message: "Workspace mode:"
}), "translate");
const __lf_9 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "5wic0R",
  message: "Editing tools are enabled for this workspace."
}), "translate");
const __lf_10 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "oYLtG0",
  message: "Editing tools are read-only for this workspace."
}), "translate");
const __lf_11 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "tQcxxg",
  message: "Region:"
}), "translate");
const __lf_12 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "7lRCx1",
  message: "Queue kind:"
}), "translate");
const __lf_13 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "gzWinp",
  message: "Assigned only:"
}), "translate");
const __lf_14 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "Fdp03t",
  message: "on"
}), "translate");
const __lf_15 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "Bdtwnw",
  message: "off"
}), "translate");
const __lf_16 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "jYKshG",
  message: "History:"
}), "translate");
const __lf_17 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "JkIYli",
  message: "shown"
}), "translate");
const __lf_18 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "zNCBmf",
  message: "hidden"
}), "translate");
const __lf_19 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "W3Ae0L",
  message: "{0} active reviewers available.",
  values: {
    0: String(card.reviewers)
  }
}), "translate");
const __lf_20 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "UbRKMZ",
  message: "Pending"
}), "translate");
const __lf_21 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "FEPXtw",
  message: "Reviewed"
}), "translate");
const __lf_22 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "3UYUtA",
  message: "Flagged"
}), "translate");
const __lf_23 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "yiNL80",
  message: "Reviewers"
}), "translate");
const __lf_24 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "mtE2Ev",
  message: "Queue details"
}), "translate");
const __lf_25 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "gimT52",
  message: "{0} items match the current filters.",
  values: {
    0: String(filteredQueue.length)
  }
}), "translate");
const __lf_26 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "Ji1wwM",
  message: "Attachments {0}, comments {1}, unread {2}.",
  values: {
    0: String($totals.attachments),
    1: String($totals.comments),
    2: String($totals.unread)
  }
}), "translate");
const __lf_27 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "szWjCj",
  message: "{0} left {1} comments while {2} still has {3} unread updates.",
  values: {
    0: item.owner,
    1: String(item.comments),
    2: item.assignee,
    3: String(item.unread)
  }
}), "translate");
const __lf_28 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "IDpMOo",
  message: "{0} left {1} comments and the queue is fully read.",
  values: {
    0: item.owner,
    1: String(item.comments)
  }
}), "translate");
const __lf_29 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "2TUOis",
  message: "Owner:"
}), "translate");
const __lf_30 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "GRmQfp",
  message: "Assignee:"
}), "translate");
const __lf_31 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "Y2+ZT9",
  message: "Comments:"
}), "translate");
const __lf_32 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "jqmIfA",
  message: "Attachments:"
}), "translate");
const __lf_33 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "lvcfoy",
  message: "Path {0}",
  values: {
    0: String(item.pathHint ?? "")
  }
}), "translate");
const __lf_34 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "pa6gX+",
  message: "No path"
}), "translate");
const __lf_35 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "qbgW+C",
  message: "Highlights"
}), "translate");
const __lf_36 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "ubwhkQ",
  message: "{0} items need attention.",
  values: {
    0: String($highlightedQueue.length)
  }
}), "translate");
const __lf_37 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "nj0sbN",
  message: "No highlighted queue items."
}), "translate");
const __lf_38 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "i4y9D/",
  message: "{0} assigned {1} with {2} comments and {3} unread changes.",
  values: {
    0: item.owner,
    1: item.assignee,
    2: String(item.comments),
    3: String(item.unread)
  }
}), "translate");
const __lf_39 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "quM66o",
  message: "Decision log"
}), "translate");
const __lf_40 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "LZB4fD",
  message: "{0} updated {1} during this step.",
  values: {
    0: row.changedBy,
    1: String(row.path ?? "the current workflow")
  }
}), "translate");
const __lf_41 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "OcCQjb",
  message: "Activity stream"
}), "translate");
const __lf_42 = <_Trans {...
/*i18n*/
{
  id: "FJeYAi",
  message: "Imported digest: <0><1/></0>",
  components: {
    0: <span />,
    1: <LinguiForSvelteHtml value={htmlDigest} />
  }
}} />;
const __lf_43 = <_Trans {...
/*i18n*/
{
  id: "JUNx+G",
  message: "Also we can embed some text and <0/> directly in translations.",
  components: {
    0: <LinguiForSvelteHtml value={"<em>some HTML</em>"} />
  }
}} />;
const __lf_44 = <_Trans {...
/*i18n*/
{
  id: "cKxDiJ",
  message: "<0>Maybe we even have some nested content to summarize, like</0> <1><2><3>{0} highlighted queue items</3> and</2><4>a selected region of {selectedRegion}.</4></1>",
  values: {
    0: highlightedQueue.length,
    selectedRegion: selectedRegion
  },
  components: {
    0: <p />,
    1: <ul />,
    2: <li />,
    3: <em />,
    4: <li />
  }
}} />;
const __lf_45 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "UsgvkK",
  message: "Status digest"
}), "translate");
const __lf_46 = <_Trans {...
/*i18n*/
{
  id: "8p/xVT",
  message: "{0, plural, one {{1}} other {{2}}}",
  values: {
    0: $highlightedQueue.length,
    1: _i18n._(
    /*i18n*/
    {
      id: "s0sXxO",
      message: "There is one highlighted queue item."
    }),
    2: _i18n._(
    /*i18n*/
    {
      id: "J4w9XN",
      message: "There are {0} highlighted queue items.",
      values: {
        0: String($highlightedQueue.length)
      }
    })
  }
}} />;
const __lf_47 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "pnokNm",
  message: "The queue is {0} and {1}.",
  values: {
    0: String(filteredQueue.length > 8 ? "very busy" : "manageable"),
    1: String($highlightedQueue.length > 2 ? "requires escalation" : "is within normal review limits")
  }
}), "translate");
const __lf_48 = __lingui_for_svelte_reactive_translation__(_i18n._(
/*i18n*/
{
  id: "d8ajL9",
  message: "Nested expression summary: {0}.",
  values: {
    0: String($highlightedQueue.length > 0 ? `highlighted:${$highlightedQueue[0]?.id ?? "none"}` : `region:${selectedRegion}`)
  }
}), "translate");