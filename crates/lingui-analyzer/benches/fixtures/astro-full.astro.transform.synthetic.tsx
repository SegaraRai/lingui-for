import { msg, select, t as translate } from "@lingui/core/macro";
import { Plural, Trans } from "lingui-for-astro/macro";
const __lf_0 = translate`Localization review dashboard`;
const __lf_1 = translate`Welcome back, ${dashboardOwner}.`;
const __lf_2 = translate(
  msg`Showing ${String(filteredQueue.length)} queue items for ${selectedRegion === "all" ? "all regions" : selectedRegion}.`,
);
const __lf_3 = select(localeMode, {
  en: "English workflow",
  ja: "Japanese workflow",
  fr: "French workflow",
  other: "Fallback workflow",
});
const __lf_4 = translate`Escalation required: unresolved high-priority queue items remain.`;
const __lf_5 = translate`Attention needed: high-priority items are waiting for review.`;
const __lf_6 = translate`All monitored queues are stable.`;
const __lf_7 = translate(
  msg`Live snapshot latency: ${String(latencyMs > 250 ? `${latencyMs}ms (slow)` : `${latencyMs}ms`)}.`,
);
const __lf_8 = translate`Operations`;
const __lf_9 = translate`Workspace mode:`;
const __lf_10 = translate`Editing tools are enabled for this workspace.`;
const __lf_11 = translate`Editing tools are read-only for this workspace.`;
const __lf_12 = translate(
                      msg`${String(card.reviewers)} active reviewers available.`,
                    );
const __lf_13 = translate`Pending`;
const __lf_14 = translate`Reviewed`;
const __lf_15 = translate`Flagged`;
const __lf_16 = translate`Reviewers`;
const __lf_17 = translate`Queue details`;
const __lf_18 = translate(
                    msg`${String(filteredQueue.length)} items match the current filters.`,
                  );
const __lf_19 = translate`Owner:`;
const __lf_20 = translate`Assignee:`;
const __lf_21 = translate`Comments:`;
const __lf_22 = translate`Attachments:`;
const __lf_23 = translate(msg`Path ${String(item.pathHint ?? "")}`);
const __lf_24 = translate`No path`;
const __lf_25 = translate`Highlights`;
const __lf_26 = translate(
                    msg`${String(highlightedQueue.length)} items need attention.`,
                  );
const __lf_27 = translate`No highlighted queue items.`;
const __lf_28 = translate(
                          msg`${item.owner} assigned ${item.assignee} with ${String(item.comments)} comments and ${String(item.unread)} unread changes.`,
                        );
const __lf_29 = translate`Decision log`;
const __lf_30 = translate(
                        msg`${row.changedBy} updated ${String(row.path ?? "the current workflow")} during this step.`,
                      );
const __lf_31 = translate`Activity stream`;
const __lf_32 = <Trans>
                Imported digest:{" "}<span>{htmlDigest}</span>
              </Trans>;
const __lf_33 = translate`Status digest`;
const __lf_34 = <Plural
            value={highlightedQueue.length}
            one={translate`There is one highlighted queue item.`}
            other={translate(
              msg`There are ${String(highlightedQueue.length)} highlighted queue items.`,
            )}
          />;
const __lf_35 = translate(
                msg`The queue is ${String(filteredQueue.length > 8 ? "very busy" : "manageable")} and ${String(highlightedQueue.length > 2 ? "requires escalation" : "is within normal review limits")}.`,
              );
const __lf_36 = translate(
                msg`Nested expression summary: ${String(
                  highlightedQueue.length > 0
                    ? `highlighted:${highlightedQueue[0]?.id ?? "none"}`
                    : `region:${selectedRegion}`,
                )}.`,
              );
const __lf_37 = translate`Reviewer notes`;
const __lf_38 = translate(
                msg`${String(activity.length)} recent notes are attached to this dashboard.`,
              );
const __lf_39 = translate`These notes mirror the kind of mixed script and template content that the compile benchmark should exercise.`;
const __lf_40 = translate(msg`Note ${String(index + 1)}`);
const __lf_41 = translate(
                    msg`${item.owner} asked ${item.assignee} to review ${String(
                      item.pathHint ?? "the current record",
                    )} with ${String(item.comments)} comments and ${String(
                      item.unread,
                    )} unread updates.`,
                  );
const __lf_42 = translate(
                    msg`Priority ${String(item.priority)}, region ${String(item.region)}, attachments ${String(item.attachments)}.`,
                  );
