import { Plural, Trans } from "lingui-for-svelte/macro";
const __lf_0 = $__l4s_translate(
/*i18n*/
{
  id: "8+nA3Y",
  message: "Welcome back, {dashboardOwner}.",
  values: {
    dashboardOwner: dashboardOwner
  }
});
const __lf_1 = $__l4s_translate(
/*i18n*/
{
  id: "5kwh2a",
  message: "Showing {0} queue items for {1}.",
  values: {
    0: String(filteredQueue.length),
    1: selectedRegion === "all" ? "all regions" : selectedRegion
  }
});
const __lf_2 = $__l4s_translate(
/*i18n*/
{
  id: "wc9bP7",
  message: "{localeMode, select, en {English workflow} ja {Japanese workflow} fr {French workflow} other {Fallback workflow}}",
  values: {
    localeMode: localeMode
  }
});
const __lf_3 = $__l4s_translate(
/*i18n*/
{
  id: "C81jcY",
  message: "Escalation required: unresolved high-priority queue items remain."
});
const __lf_4 = $__l4s_translate(
/*i18n*/
{
  id: "jJ+oTf",
  message: "Attention needed: high-priority items are waiting for review."
});
const __lf_5 = $__l4s_translate(
/*i18n*/
{
  id: "GzY8qo",
  message: "All monitored queues are stable."
});
const __lf_6 = $__l4s_translate(
/*i18n*/
{
  id: "lC/3w5",
  message: "Live snapshot latency: {0}.",
  values: {
    0: String(latencyMs > 250 ? `${latencyMs}ms (slow)` : `${latencyMs}ms`)
  }
});
const __lf_7 = $__l4s_translate(
/*i18n*/
{
  id: "B1MDds",
  message: "Operations"
});
const __lf_8 = $__l4s_translate(
/*i18n*/
{
  id: "xdDw1Z",
  message: "Workspace mode:"
});
const __lf_9 = $__l4s_translate(
/*i18n*/
{
  id: "5wic0R",
  message: "Editing tools are enabled for this workspace."
});
const __lf_10 = $__l4s_translate(
/*i18n*/
{
  id: "oYLtG0",
  message: "Editing tools are read-only for this workspace."
});
const __lf_11 = $__l4s_translate(
/*i18n*/
{
  id: "tQcxxg",
  message: "Region:"
});
const __lf_12 = $__l4s_translate(
/*i18n*/
{
  id: "7lRCx1",
  message: "Queue kind:"
});
const __lf_13 = $__l4s_translate(
/*i18n*/
{
  id: "gzWinp",
  message: "Assigned only:"
});
const __lf_14 = $__l4s_translate(
/*i18n*/
{
  id: "Fdp03t",
  message: "on"
});
const __lf_15 = $__l4s_translate(
/*i18n*/
{
  id: "Bdtwnw",
  message: "off"
});
const __lf_16 = $__l4s_translate(
/*i18n*/
{
  id: "jYKshG",
  message: "History:"
});
const __lf_17 = $__l4s_translate(
/*i18n*/
{
  id: "JkIYli",
  message: "shown"
});
const __lf_18 = $__l4s_translate(
/*i18n*/
{
  id: "zNCBmf",
  message: "hidden"
});
const __lf_19 = $__l4s_translate(
/*i18n*/
{
  id: "W3Ae0L",
  message: "{0} active reviewers available.",
  values: {
    0: String(card.reviewers)
  }
});
const __lf_20 = $__l4s_translate(
/*i18n*/
{
  id: "UbRKMZ",
  message: "Pending"
});
const __lf_21 = $__l4s_translate(
/*i18n*/
{
  id: "FEPXtw",
  message: "Reviewed"
});
const __lf_22 = $__l4s_translate(
/*i18n*/
{
  id: "3UYUtA",
  message: "Flagged"
});
const __lf_23 = $__l4s_translate(
/*i18n*/
{
  id: "yiNL80",
  message: "Reviewers"
});
const __lf_24 = $__l4s_translate(
/*i18n*/
{
  id: "mtE2Ev",
  message: "Queue details"
});
const __lf_25 = $__l4s_translate(
/*i18n*/
{
  id: "gimT52",
  message: "{0} items match the current filters.",
  values: {
    0: String(filteredQueue.length)
  }
});
const __lf_26 = $__l4s_translate(
/*i18n*/
{
  id: "Ji1wwM",
  message: "Attachments {0}, comments {1}, unread {2}.",
  values: {
    0: String($totals.attachments),
    1: String($totals.comments),
    2: String($totals.unread)
  }
});
const __lf_27 = $__l4s_translate(
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
});
const __lf_28 = $__l4s_translate(
/*i18n*/
{
  id: "IDpMOo",
  message: "{0} left {1} comments and the queue is fully read.",
  values: {
    0: item.owner,
    1: String(item.comments)
  }
});
const __lf_29 = $__l4s_translate(
/*i18n*/
{
  id: "2TUOis",
  message: "Owner:"
});
const __lf_30 = $__l4s_translate(
/*i18n*/
{
  id: "GRmQfp",
  message: "Assignee:"
});
const __lf_31 = $__l4s_translate(
/*i18n*/
{
  id: "Y2+ZT9",
  message: "Comments:"
});
const __lf_32 = $__l4s_translate(
/*i18n*/
{
  id: "jqmIfA",
  message: "Attachments:"
});
const __lf_33 = $__l4s_translate(
/*i18n*/
{
  id: "lvcfoy",
  message: "Path {0}",
  values: {
    0: String(item.pathHint ?? "")
  }
});
const __lf_34 = $__l4s_translate(
/*i18n*/
{
  id: "pa6gX+",
  message: "No path"
});
const __lf_35 = $__l4s_translate(
/*i18n*/
{
  id: "qbgW+C",
  message: "Highlights"
});
const __lf_36 = $__l4s_translate(
/*i18n*/
{
  id: "ubwhkQ",
  message: "{0} items need attention.",
  values: {
    0: String($highlightedQueue.length)
  }
});
const __lf_37 = $__l4s_translate(
/*i18n*/
{
  id: "nj0sbN",
  message: "No highlighted queue items."
});
const __lf_38 = $__l4s_translate(
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
});
const __lf_39 = $__l4s_translate(
/*i18n*/
{
  id: "quM66o",
  message: "Decision log"
});
const __lf_40 = $__l4s_translate(
/*i18n*/
{
  id: "LZB4fD",
  message: "{0} updated {1} during this step.",
  values: {
    0: row.changedBy,
    1: String(row.path ?? "the current workflow")
  }
});
const __lf_41 = $__l4s_translate(
/*i18n*/
{
  id: "OcCQjb",
  message: "Activity stream"
});
const __lf_42 = <Trans>
            Imported digest:{" "}<span><LinguiForSvelteHtml value={htmlDigest} /></span>
          </Trans>;
const __lf_43 = <Trans>
            Also we can embed{" "}{"some text"}{" "}and{" "}<LinguiForSvelteHtml value={"<em>some HTML</em>"} />{" "}directly
            in translations.
          </Trans>;
const __lf_44 = <Trans>
            <p>Maybe we even have some nested content to summarize, like</p>{" "}<ul>
              <li>
                <em>{highlightedQueue.length} highlighted queue items</em> and
              </li>
              <li>a selected region of {selectedRegion}.</li>
            </ul>
          </Trans>;
const __lf_45 = $__l4s_translate(
/*i18n*/
{
  id: "UsgvkK",
  message: "Status digest"
});
const __lf_46 = <Plural value={$highlightedQueue.length} one={__l4s_getI18n()._(
/*i18n*/
{
  id: "s0sXxO",
  message: "There is one highlighted queue item."
})} other={__l4s_getI18n()._(
/*i18n*/
{
  id: "J4w9XN",
  message: "There are {0} highlighted queue items.",
  values: {
    0: String($highlightedQueue.length)
  }
})} />;
const __lf_47 = $__l4s_translate(
/*i18n*/
{
  id: "pnokNm",
  message: "The queue is {0} and {1}.",
  values: {
    0: String(filteredQueue.length > 8 ? "very busy" : "manageable"),
    1: String($highlightedQueue.length > 2 ? "requires escalation" : "is within normal review limits")
  }
});
const __lf_48 = $__l4s_translate(
/*i18n*/
{
  id: "d8ajL9",
  message: "Nested expression summary: {0}.",
  values: {
    0: String($highlightedQueue.length > 0 ? `highlighted:${$highlightedQueue[0]?.id ?? "none"}` : `region:${selectedRegion}`)
  }
});