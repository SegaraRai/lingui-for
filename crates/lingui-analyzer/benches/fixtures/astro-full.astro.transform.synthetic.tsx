import { msg, select, t as translate } from "@lingui/core/macro";
import { Plural, Trans, ph } from "lingui-for-astro/macro";
/* lingui-set context="fixture-frontmatter-block" comment="Astro fixture frontmatter block directive" idPrefix="fixture." */
const __lf_0 = translate({
  id: "frontmatter-block",
  message: "Fixture frontmatter block directive message.",
});
const __lf_1 = translate`Fixture review owner: ${ph({ ownerName: dashboardOwner })}.`;
/* lingui-reset */
const __lf_2 = translate`Localization review dashboard`;
const __lf_3 = translate`Welcome back, ${dashboardOwner}.`;
const __lf_4 = translate(
  msg`Showing ${String(filteredQueue.length)} queue items for ${selectedRegion === "all" ? "all regions" : selectedRegion}.`,
);
const __lf_5 = select(localeMode, {
  en: "English workflow",
  ja: "Japanese workflow",
  fr: "French workflow",
  other: "Fallback workflow",
});
const __lf_6 = translate`Escalation required: unresolved high-priority queue items remain.`;
const __lf_7 = translate`Attention needed: high-priority items are waiting for review.`;
const __lf_8 = translate`All monitored queues are stable.`;
const __lf_9 = translate(
  msg`Live snapshot latency: ${String(latencyMs > 250 ? `${latencyMs}ms (slow)` : `${latencyMs}ms`)}.`,
);
/* lingui-reset context="fixture-cross-block" comment="Astro fixture directive crossing frontmatter" idPrefix="fixture." */
const __lf_10 = <Trans id="cross-block">Fixture directive inherited from Astro frontmatter.</Trans>;
/* lingui-reset */
/* lingui-reset */
const __lf_11 = translate`Operations`;
const __lf_12 = translate`Workspace mode:`;
const __lf_13 = translate`Editing tools are enabled for this workspace.`;
const __lf_14 = translate`Editing tools are read-only for this workspace.`;
const __lf_15 = translate(
                      msg`${String(card.reviewers)} active reviewers available.`,
                    );
const __lf_16 = translate`Pending`;
const __lf_17 = translate`Reviewed`;
const __lf_18 = translate`Flagged`;
const __lf_19 = translate`Reviewers`;
const __lf_20 = translate`Queue details`;
const __lf_21 = translate(
                    msg`${String(filteredQueue.length)} items match the current filters.`,
                  );
const __lf_22 = translate(
                        msg`${item.owner} left ${String(item.comments)} comments while ${item.assignee} still has ${String(item.unread)} unread updates.`,
                      );
const __lf_23 = translate(
                        msg`${item.owner} left ${String(item.comments)} comments and the queue is fully read.`,
                      );
const __lf_24 = translate`Owner:`;
const __lf_25 = translate`Assignee:`;
const __lf_26 = translate`Comments:`;
const __lf_27 = translate`Attachments:`;
const __lf_28 = translate(msg`Path ${String(item.pathHint ?? "")}`);
const __lf_29 = translate`No path`;
const __lf_30 = translate`Highlights`;
const __lf_31 = translate(
                    msg`${String(highlightedQueue.length)} items need attention.`,
                  );
const __lf_32 = translate`No highlighted queue items.`;
const __lf_33 = translate(
                          msg`${item.owner} assigned ${item.assignee} with ${String(item.comments)} comments and ${String(item.unread)} unread changes.`,
                        );
const __lf_34 = translate`Decision log`;
const __lf_35 = translate(
                        msg`${row.changedBy} updated ${String(row.path ?? "the current workflow")} during this step.`,
                      );
const __lf_36 = translate`Activity stream`;
const __lf_37 = <Trans>
                Imported digest:{" "}<span set:html={htmlDigest} />
              </Trans>;
const __lf_38 = <Trans>
                Also we can embed{" "}<span set:text="some text" />{" "}and{" "}<span
                  set:html="<em>some HTML</em>"
                />{" "}directly in translations.
              </Trans>;
const __lf_39 = <Trans>
                <p>Maybe we even have some nested content to summarize, like</p>{" "}<ul>
                  <li>
                    <em>{highlightedQueue.length} highlighted queue items</em> and
                  </li>
                  <li>a selected region of {selectedRegion}.</li>
                </ul>
              </Trans>;
const __lf_40 = translate`Status digest`;
const __lf_41 = <Plural
            value={highlightedQueue.length}
            one={translate`There is one highlighted queue item.`}
            other={translate(
              msg`There are ${String(highlightedQueue.length)} highlighted queue items.`,
            )}
          />;
const __lf_42 = translate(
                msg`The queue is ${String(filteredQueue.length > 8 ? "very busy" : "manageable")} and ${String(highlightedQueue.length > 2 ? "requires escalation" : "is within normal review limits")}.`,
              );
const __lf_43 = translate(
                msg`Nested expression summary: ${String(
                  highlightedQueue.length > 0
                    ? `highlighted:${highlightedQueue[0]?.id ?? "none"}`
                    : `region:${selectedRegion}`,
                )}.`,
              );
const __lf_44 = translate`Astro interpolation coverage`;
const __lf_45 = translate`Fixture plain translated expression inside an Astro interpolation.`;
const __lf_46 = translate`Fixture single translated element root inside an Astro interpolation.`;
const __lf_47 = translate`Fixture first translated fragment child inside an Astro interpolation.`;
const __lf_48 = translate`Fixture second translated fragment child inside an Astro interpolation.`;
const __lf_49 = translate`Fixture first translated invalid adjacent root inside an Astro interpolation.`;
const __lf_50 = translate`Fixture second translated invalid adjacent root inside an Astro interpolation.`;
const __lf_51 = translate`Fixture first translated fragment child after an HTML comment.`;
const __lf_52 = translate`Fixture second translated fragment child after an HTML comment.`;
const __lf_53 = <Trans>Fixture plain Trans component root inside an Astro interpolation.</Trans>;
const __lf_54 = <Trans>
            <p>Fixture single element root inside a Trans component interpolation.</p>
          </Trans>;
const __lf_55 = translate`Fixture message before a JavaScript comment interpolation.`;
const __lf_56 = translate`Fixture message after a JavaScript comment interpolation.`;
const __lf_57 = translate`Fixture message before an HTML comment interpolation.`;
const __lf_58 = translate`Fixture message after an HTML comment interpolation.`;
const __lf_59 = <Trans>{`Fixture plain expression inside a Trans-wrapped Astro interpolation.`}</Trans>;
const __lf_60 = <Trans>
          <p>Fixture single element root inside a Trans-wrapped Astro interpolation.</p>
        </Trans>;
const __lf_61 = <Trans>
          
            <__astro_frag>
              <p>Fixture first fragment child inside a Trans-wrapped Astro interpolation.</p>
              <p>Fixture second fragment child inside a Trans-wrapped Astro interpolation.</p>
            </__astro_frag>
          
        </Trans>;
const __lf_62 = <Trans>
          Fixture message before a Trans-wrapped HTML comment interpolation.{" "}<__astro_cm />{" "}Fixture message after a Trans-wrapped HTML comment interpolation.
        </Trans>;
const __lf_63 = <Trans>
          <Fragment />{" "}Fixture message after a conditional Astro HTML comment.
        </Trans>;
const __lf_64 = <Trans>Fixture translated Trans consequent branch inside an Astro interpolation.</Trans>;
const __lf_65 = <Trans>Fixture translated Trans alternate branch inside an Astro interpolation.</Trans>;
const __lf_66 = <Trans>
          Fixture message before a Trans-wrapped JavaScript comment interpolation.{" "}{/* fixture-trans-wrapped-js-comment-only-between-messages */}{" "}Fixture message after a Trans-wrapped JavaScript comment interpolation.
        </Trans>;
const __lf_67 = <Trans>
            
              <__astro_frag>
                <p>Fixture first fragment child inside an interpolated Trans component.</p>
                <p>Fixture second fragment child inside an interpolated Trans component.</p>
              </__astro_frag>
            
          </Trans>;
const __lf_68 = <Trans>Fixture named placeholder in Astro markup:{" "}{ph({ ownerName: dashboardOwner })}.</Trans>;
/* lingui-set context="fixture-html-comment" comment="Astro fixture HTML directive" */
const __lf_69 = <Trans>Fixture directive from an Astro HTML comment.</Trans>;
/* lingui-reset context="fixture-expression-block" comment="Astro fixture expression block directive" */
const __lf_70 = <Trans>Fixture directive from an Astro expression block comment.</Trans>;
/* lingui-reset context="fixture-expression-line" comment="Astro fixture expression line directive" */
const __lf_71 = <Trans>Fixture directive from an Astro expression line comment.</Trans>;
/* lingui-reset */
/* lingui-reset */
const __lf_72 = translate`Reviewer notes`;
const __lf_73 = translate(
                msg`${String(activity.length)} recent notes are attached to this dashboard.`,
              );
const __lf_74 = translate`These notes mirror the kind of mixed script and template content that the transform benchmark should exercise.`;
const __lf_75 = translate(msg`Note ${String(index + 1)}`);
const __lf_76 = translate(
                    msg`${item.owner} asked ${item.assignee} to review ${String(
                      item.pathHint ?? "the current record",
                    )} with ${String(item.comments)} comments and ${String(
                      item.unread,
                    )} unread updates.`,
                  );
const __lf_77 = translate(
                    msg`Priority ${String(item.priority)}, region ${String(item.region)}, attachments ${String(item.attachments)}.`,
                  );
