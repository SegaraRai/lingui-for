import { msg } from "@lingui/core/macro";

import {
  defineMacroWorkbench,
  type MacroWorkbenchAuthorSpec,
} from "../../../lib/macro-workbench.ts";

const workbench = defineMacroWorkbench({
  controls: [
    {
      id: "tone",
      type: "select",
      initial: "formal",
      label: msg`Tone`,
      options: [
        {
          label: msg`Formal`,
          value: "formal",
        },
        {
          label: msg`Casual`,
          value: "casual",
        },
        {
          label: msg`Other`,
          value: "other",
        },
      ],
    },
  ],
} satisfies MacroWorkbenchAuthorSpec);

export default workbench;
