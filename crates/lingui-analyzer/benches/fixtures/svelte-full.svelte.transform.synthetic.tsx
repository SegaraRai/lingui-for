import { msg, select, t as translate } from "@lingui/core/macro";
import { Plural, Trans } from "lingui-for-svelte/macro";
const __lf_0 = __lingui_for_svelte_reactive_translation__(translate`Welcome back, ${dashboardOwner}.`, "translate");
const __lf_1 = __lingui_for_svelte_reactive_translation__(translate(
      msg`Showing ${String(filteredQueue.length)} queue items for ${selectedRegion === "all" ? "all regions" : selectedRegion}.`,
    ), "translate");
const __lf_2 = __lingui_for_svelte_reactive_translation__(select(localeMode, {
      en: "English workflow",
      ja: "Japanese workflow",
      fr: "French workflow",
      other: "Fallback workflow",
    }), "select");
const __lf_3 = __lingui_for_svelte_reactive_translation__(translate`Escalation required: unresolved high-priority queue items remain.`, "translate");
const __lf_4 = __lingui_for_svelte_reactive_translation__(translate`Attention needed: high-priority items are waiting for review.`, "translate");
const __lf_5 = __lingui_for_svelte_reactive_translation__(translate`All monitored queues are stable.`, "translate");
const __lf_6 = __lingui_for_svelte_reactive_translation__(translate(
      msg`Live snapshot latency: ${String(latencyMs > 250 ? `${latencyMs}ms (slow)` : `${latencyMs}ms`)}.`,
    ), "translate");
const __lf_7 = __lingui_for_svelte_reactive_translation__(translate`Operations`, "translate");
const __lf_8 = __lingui_for_svelte_reactive_translation__(translate`Workspace mode:`, "translate");
const __lf_9 = __lingui_for_svelte_reactive_translation__(translate`Editing tools are enabled for this workspace.`, "translate");
const __lf_10 = __lingui_for_svelte_reactive_translation__(translate`Editing tools are read-only for this workspace.`, "translate");
const __lf_11 = __lingui_for_svelte_reactive_translation__(translate`Region:`, "translate");
const __lf_12 = __lingui_for_svelte_reactive_translation__(translate`Queue kind:`, "translate");
const __lf_13 = __lingui_for_svelte_reactive_translation__(translate`Assigned only:`, "translate");
const __lf_14 = __lingui_for_svelte_reactive_translation__(translate`on`, "translate");
const __lf_15 = __lingui_for_svelte_reactive_translation__(translate`off`, "translate");
const __lf_16 = __lingui_for_svelte_reactive_translation__(translate`History:`, "translate");
const __lf_17 = __lingui_for_svelte_reactive_translation__(translate`shown`, "translate");
const __lf_18 = __lingui_for_svelte_reactive_translation__(translate`hidden`, "translate");
const __lf_19 = __lingui_for_svelte_reactive_translation__(translate(
                msg`${String(card.reviewers)} active reviewers available.`,
              ), "translate");
const __lf_20 = __lingui_for_svelte_reactive_translation__(translate`Pending`, "translate");
const __lf_21 = __lingui_for_svelte_reactive_translation__(translate`Reviewed`, "translate");
const __lf_22 = __lingui_for_svelte_reactive_translation__(translate`Flagged`, "translate");
const __lf_23 = __lingui_for_svelte_reactive_translation__(translate`Reviewers`, "translate");
const __lf_24 = __lingui_for_svelte_reactive_translation__(translate`Queue details`, "translate");
const __lf_25 = __lingui_for_svelte_reactive_translation__(translate(
              msg`${String(filteredQueue.length)} items match the current filters.`,
            ), "translate");
const __lf_26 = __lingui_for_svelte_reactive_translation__(translate(
            msg`Attachments ${String($totals.attachments)}, comments ${String($totals.comments)}, unread ${String($totals.unread)}.`,
          ), "translate");
const __lf_27 = __lingui_for_svelte_reactive_translation__(translate(
                  msg`${item.owner} left ${String(item.comments)} comments while ${item.assignee} still has ${String(item.unread)} unread updates.`,
                ), "translate");
const __lf_28 = __lingui_for_svelte_reactive_translation__(translate(
                  msg`${item.owner} left ${String(item.comments)} comments and the queue is fully read.`,
                ), "translate");
const __lf_29 = __lingui_for_svelte_reactive_translation__(translate`Owner:`, "translate");
const __lf_30 = __lingui_for_svelte_reactive_translation__(translate`Assignee:`, "translate");
const __lf_31 = __lingui_for_svelte_reactive_translation__(translate`Comments:`, "translate");
const __lf_32 = __lingui_for_svelte_reactive_translation__(translate`Attachments:`, "translate");
const __lf_33 = __lingui_for_svelte_reactive_translation__(translate(msg`Path ${String(item.pathHint ?? "")}`), "translate");
const __lf_34 = __lingui_for_svelte_reactive_translation__(translate`No path`, "translate");
const __lf_35 = __lingui_for_svelte_reactive_translation__(translate`Highlights`, "translate");
const __lf_36 = __lingui_for_svelte_reactive_translation__(translate(
              msg`${String($highlightedQueue.length)} items need attention.`,
            ), "translate");
const __lf_37 = __lingui_for_svelte_reactive_translation__(translate`No highlighted queue items.`, "translate");
const __lf_38 = __lingui_for_svelte_reactive_translation__(translate(
                    msg`${item.owner} assigned ${item.assignee} with ${String(item.comments)} comments and ${String(item.unread)} unread changes.`,
                  ), "translate");
const __lf_39 = __lingui_for_svelte_reactive_translation__(translate`Decision log`, "translate");
const __lf_40 = __lingui_for_svelte_reactive_translation__(translate(
                  msg`${row.changedBy} updated ${String(row.path ?? "the current workflow")} during this step.`,
                ), "translate");
const __lf_41 = __lingui_for_svelte_reactive_translation__(translate`Activity stream`, "translate");
const __lf_42 = <Trans>
            Imported digest:{" "}<span>{htmlDigest}</span>
          </Trans>;
const __lf_43 = __lingui_for_svelte_reactive_translation__(translate`Status digest`, "translate");
const __lf_44 = <Plural
        value={$highlightedQueue.length}
        one={translate`There is one highlighted queue item.`}
        other={translate(
          msg`There are ${String($highlightedQueue.length)} highlighted queue items.`,
        )}
      />;
const __lf_45 = __lingui_for_svelte_reactive_translation__(translate(
          msg`The queue is ${String(filteredQueue.length > 8 ? "very busy" : "manageable")} and ${String($highlightedQueue.length > 2 ? "requires escalation" : "is within normal review limits")}.`,
        ), "translate");
const __lf_46 = __lingui_for_svelte_reactive_translation__(translate(
          msg`Nested expression summary: ${String(
            $highlightedQueue.length > 0
              ? `highlighted:${$highlightedQueue[0]?.id ?? "none"}`
              : `region:${selectedRegion}`,
          )}.`,
        ), "translate");
