import { Trans as _Trans } from "@lingui/react";
const __lf_0 = __l4a_i18n._(
/*i18n*/
{
  id: "8KhxNb",
  message: "Localization review dashboard"
});
const __lf_1 = __l4a_i18n._(
/*i18n*/
{
  id: "8+nA3Y",
  message: "Welcome back, {dashboardOwner}.",
  values: {
    dashboardOwner: dashboardOwner
  }
});
const __lf_2 = __l4a_i18n._(
/*i18n*/
{
  id: "5kwh2a",
  message: "Showing {0} queue items for {1}.",
  values: {
    0: String(filteredQueue.length),
    1: selectedRegion === "all" ? "all regions" : selectedRegion
  }
});
const __lf_3 = __l4a_i18n._(
/*i18n*/
{
  id: "wc9bP7",
  message: "{localeMode, select, en {English workflow} ja {Japanese workflow} fr {French workflow} other {Fallback workflow}}",
  values: {
    localeMode: localeMode
  }
});
const __lf_4 = __l4a_i18n._(
/*i18n*/
{
  id: "C81jcY",
  message: "Escalation required: unresolved high-priority queue items remain."
});
const __lf_5 = __l4a_i18n._(
/*i18n*/
{
  id: "jJ+oTf",
  message: "Attention needed: high-priority items are waiting for review."
});
const __lf_6 = __l4a_i18n._(
/*i18n*/
{
  id: "GzY8qo",
  message: "All monitored queues are stable."
});
const __lf_7 = __l4a_i18n._(
/*i18n*/
{
  id: "lC/3w5",
  message: "Live snapshot latency: {0}.",
  values: {
    0: String(latencyMs > 250 ? `${latencyMs}ms (slow)` : `${latencyMs}ms`)
  }
});
const __lf_8 = __l4a_i18n._(
/*i18n*/
{
  id: "B1MDds",
  message: "Operations"
});
const __lf_9 = __l4a_i18n._(
/*i18n*/
{
  id: "xdDw1Z",
  message: "Workspace mode:"
});
const __lf_10 = __l4a_i18n._(
/*i18n*/
{
  id: "5wic0R",
  message: "Editing tools are enabled for this workspace."
});
const __lf_11 = __l4a_i18n._(
/*i18n*/
{
  id: "oYLtG0",
  message: "Editing tools are read-only for this workspace."
});
const __lf_12 = __l4a_i18n._(
/*i18n*/
{
  id: "W3Ae0L",
  message: "{0} active reviewers available.",
  values: {
    0: String(card.reviewers)
  }
});
const __lf_13 = __l4a_i18n._(
/*i18n*/
{
  id: "UbRKMZ",
  message: "Pending"
});
const __lf_14 = __l4a_i18n._(
/*i18n*/
{
  id: "FEPXtw",
  message: "Reviewed"
});
const __lf_15 = __l4a_i18n._(
/*i18n*/
{
  id: "3UYUtA",
  message: "Flagged"
});
const __lf_16 = __l4a_i18n._(
/*i18n*/
{
  id: "yiNL80",
  message: "Reviewers"
});
const __lf_17 = __l4a_i18n._(
/*i18n*/
{
  id: "mtE2Ev",
  message: "Queue details"
});
const __lf_18 = __l4a_i18n._(
/*i18n*/
{
  id: "gimT52",
  message: "{0} items match the current filters.",
  values: {
    0: String(filteredQueue.length)
  }
});
const __lf_19 = __l4a_i18n._(
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
const __lf_20 = __l4a_i18n._(
/*i18n*/
{
  id: "IDpMOo",
  message: "{0} left {1} comments and the queue is fully read.",
  values: {
    0: item.owner,
    1: String(item.comments)
  }
});
const __lf_21 = __l4a_i18n._(
/*i18n*/
{
  id: "2TUOis",
  message: "Owner:"
});
const __lf_22 = __l4a_i18n._(
/*i18n*/
{
  id: "GRmQfp",
  message: "Assignee:"
});
const __lf_23 = __l4a_i18n._(
/*i18n*/
{
  id: "Y2+ZT9",
  message: "Comments:"
});
const __lf_24 = __l4a_i18n._(
/*i18n*/
{
  id: "jqmIfA",
  message: "Attachments:"
});
const __lf_25 = __l4a_i18n._(
/*i18n*/
{
  id: "lvcfoy",
  message: "Path {0}",
  values: {
    0: String(item.pathHint ?? "")
  }
});
const __lf_26 = __l4a_i18n._(
/*i18n*/
{
  id: "pa6gX+",
  message: "No path"
});
const __lf_27 = __l4a_i18n._(
/*i18n*/
{
  id: "qbgW+C",
  message: "Highlights"
});
const __lf_28 = __l4a_i18n._(
/*i18n*/
{
  id: "ubwhkQ",
  message: "{0} items need attention.",
  values: {
    0: String(highlightedQueue.length)
  }
});
const __lf_29 = __l4a_i18n._(
/*i18n*/
{
  id: "nj0sbN",
  message: "No highlighted queue items."
});
const __lf_30 = __l4a_i18n._(
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
const __lf_31 = __l4a_i18n._(
/*i18n*/
{
  id: "quM66o",
  message: "Decision log"
});
const __lf_32 = __l4a_i18n._(
/*i18n*/
{
  id: "LZB4fD",
  message: "{0} updated {1} during this step.",
  values: {
    0: row.changedBy,
    1: String(row.path ?? "the current workflow")
  }
});
const __lf_33 = __l4a_i18n._(
/*i18n*/
{
  id: "OcCQjb",
  message: "Activity stream"
});
const __lf_34 = <_Trans {...
/*i18n*/
{
  id: "GM89YS",
  message: "Imported digest: <0/>",
  components: {
    0: <span set:html={htmlDigest} />
  }
}} />;
const __lf_35 = <_Trans {...
/*i18n*/
{
  id: "8e7f33",
  message: "Also we can embed <0/> and <1/> directly in translations.",
  components: {
    0: <span set:text="some text" />,
    1: <span set:html="<em>some HTML</em>" />
  }
}} />;
const __lf_36 = <_Trans {...
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
const __lf_37 = __l4a_i18n._(
/*i18n*/
{
  id: "UsgvkK",
  message: "Status digest"
});
const __lf_38 = <_Trans {...
/*i18n*/
{
  id: "8p/xVT",
  message: "{0, plural, one {{1}} other {{2}}}",
  values: {
    0: highlightedQueue.length,
    1: __l4a_i18n._(
    /*i18n*/
    {
      id: "s0sXxO",
      message: "There is one highlighted queue item."
    }),
    2: __l4a_i18n._(
    /*i18n*/
    {
      id: "J4w9XN",
      message: "There are {0} highlighted queue items.",
      values: {
        0: String(highlightedQueue.length)
      }
    })
  }
}} />;
const __lf_39 = __l4a_i18n._(
/*i18n*/
{
  id: "pnokNm",
  message: "The queue is {0} and {1}.",
  values: {
    0: String(filteredQueue.length > 8 ? "very busy" : "manageable"),
    1: String(highlightedQueue.length > 2 ? "requires escalation" : "is within normal review limits")
  }
});
const __lf_40 = __l4a_i18n._(
/*i18n*/
{
  id: "d8ajL9",
  message: "Nested expression summary: {0}.",
  values: {
    0: String(highlightedQueue.length > 0 ? `highlighted:${highlightedQueue[0]?.id ?? "none"}` : `region:${selectedRegion}`)
  }
});
const __lf_41 = __l4a_i18n._(
/*i18n*/
{
  id: "/Hs6aJ",
  message: "Astro interpolation coverage"
});
const __lf_42 = __l4a_i18n._(
/*i18n*/
{
  id: "OUJFY2",
  message: "Fixture plain translated expression inside an Astro interpolation."
});
const __lf_43 = __l4a_i18n._(
/*i18n*/
{
  id: "3TeUZB",
  message: "Fixture single translated element root inside an Astro interpolation."
});
const __lf_44 = __l4a_i18n._(
/*i18n*/
{
  id: "XzqH2P",
  message: "Fixture first translated fragment child inside an Astro interpolation."
});
const __lf_45 = __l4a_i18n._(
/*i18n*/
{
  id: "EhKDrd",
  message: "Fixture second translated fragment child inside an Astro interpolation."
});
const __lf_46 = __l4a_i18n._(
/*i18n*/
{
  id: "3Gb71T",
  message: "Fixture first translated invalid adjacent root inside an Astro interpolation."
});
const __lf_47 = __l4a_i18n._(
/*i18n*/
{
  id: "bl2cw1",
  message: "Fixture second translated invalid adjacent root inside an Astro interpolation."
});
const __lf_48 = __l4a_i18n._(
/*i18n*/
{
  id: "Xw1Yw2",
  message: "Fixture first translated fragment child after an HTML comment."
});
const __lf_49 = __l4a_i18n._(
/*i18n*/
{
  id: "iYC4bE",
  message: "Fixture second translated fragment child after an HTML comment."
});
const __lf_50 = <_Trans {...
/*i18n*/
{
  id: "GQP3fh",
  message: "Fixture plain Trans component root inside an Astro interpolation."
}} />;
const __lf_51 = <_Trans {...
/*i18n*/
{
  id: "45xGAX",
  message: "<0>Fixture single element root inside a Trans component interpolation.</0>",
  components: {
    0: <p />
  }
}} />;
const __lf_52 = __l4a_i18n._(
/*i18n*/
{
  id: "8c97fG",
  message: "Fixture message before a JavaScript comment interpolation."
});
const __lf_53 = __l4a_i18n._(
/*i18n*/
{
  id: "O0RViL",
  message: "Fixture message after a JavaScript comment interpolation."
});
const __lf_54 = __l4a_i18n._(
/*i18n*/
{
  id: "gMgE+g",
  message: "Fixture message before an HTML comment interpolation."
});
const __lf_55 = __l4a_i18n._(
/*i18n*/
{
  id: "L5j9K9",
  message: "Fixture message after an HTML comment interpolation."
});
const __lf_56 = <_Trans {...
/*i18n*/
{
  id: "d0h02s",
  message: "Fixture plain expression inside a Trans-wrapped Astro interpolation."
}} />;
const __lf_57 = <_Trans {...
/*i18n*/
{
  id: "bJh00U",
  message: "<0>Fixture single element root inside a Trans-wrapped Astro interpolation.</0>",
  components: {
    0: <p />
  }
}} />;
const __lf_58 = <_Trans {...
/*i18n*/
{
  id: "x2qFIo",
  message: "<0><1>Fixture first fragment child inside a Trans-wrapped Astro interpolation.</1><2>Fixture second fragment child inside a Trans-wrapped Astro interpolation.</2></0>",
  components: {
    0: <__astro_frag />,
    1: <p />,
    2: <p />
  }
}} />;
const __lf_59 = <_Trans {...
/*i18n*/
{
  id: "yJ0bVP",
  message: "Fixture message before a Trans-wrapped HTML comment interpolation. <0/> Fixture message after a Trans-wrapped HTML comment interpolation.",
  components: {
    0: <__astro_cm />
  }
}} />;
const __lf_60 = <_Trans {...
/*i18n*/
{
  id: "0tE8NX",
  message: "{0} Fixture message after a conditional Astro HTML comment.",
  values: {
    0: useCommentBranch ? <__astro_cm /> : <span>Fixture fallback branch inside a Trans-wrapped Astro interpolation.</span>
  }
}} />;
const __lf_61 = <_Trans {...
/*i18n*/
{
  id: "O5ta/s",
  message: "Fixture message before a Trans-wrapped JavaScript comment interpolation.  Fixture message after a Trans-wrapped JavaScript comment interpolation."
}} />;
const __lf_62 = <_Trans {...
/*i18n*/
{
  id: "domltM",
  message: "<0><1>Fixture first fragment child inside an interpolated Trans component.</1><2>Fixture second fragment child inside an interpolated Trans component.</2></0>",
  components: {
    0: <__astro_frag />,
    1: <p />,
    2: <p />
  }
}} />;
const __lf_63 = __l4a_i18n._(
/*i18n*/
{
  id: "RDy8BL",
  message: "Reviewer notes"
});
const __lf_64 = __l4a_i18n._(
/*i18n*/
{
  id: "CNkP4q",
  message: "{0} recent notes are attached to this dashboard.",
  values: {
    0: String(activity.length)
  }
});
const __lf_65 = __l4a_i18n._(
/*i18n*/
{
  id: "JpH47+",
  message: "These notes mirror the kind of mixed script and template content that the transform benchmark should exercise."
});
const __lf_66 = __l4a_i18n._(
/*i18n*/
{
  id: "AzV+h+",
  message: "Note {0}",
  values: {
    0: String(index + 1)
  }
});
const __lf_67 = __l4a_i18n._(
/*i18n*/
{
  id: "wXh6Ku",
  message: "{0} asked {1} to review {2} with {3} comments and {4} unread updates.",
  values: {
    0: item.owner,
    1: item.assignee,
    2: String(item.pathHint ?? "the current record"),
    3: String(item.comments),
    4: String(item.unread)
  }
});
const __lf_68 = __l4a_i18n._(
/*i18n*/
{
  id: "e3ghLa",
  message: "Priority {0}, region {1}, attachments {2}.",
  values: {
    0: String(item.priority),
    1: String(item.region),
    2: String(item.attachments)
  }
});