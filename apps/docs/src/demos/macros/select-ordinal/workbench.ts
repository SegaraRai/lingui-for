import { msg } from "@lingui/core/macro";

import {
  defineMacroWorkbench,
  type MacroWorkbenchAuthorSpec,
} from "../../../lib/macro-workbench.ts";

const workbench = defineMacroWorkbench({
  controls: [
    {
      id: "place",
      type: "number",
      initial: 2,
      label: msg`Place`,
      max: 25,
      min: 1,
      step: 1,
    },
  ],
} satisfies MacroWorkbenchAuthorSpec);

export default workbench;
