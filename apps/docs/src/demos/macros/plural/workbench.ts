import { msg } from "@lingui/core/macro";

import {
  defineMacroWorkbench,
  type MacroWorkbenchAuthorSpec,
} from "../../../lib/macro-workbench/spec.ts";

const workbench = defineMacroWorkbench({
  controls: [
    {
      id: "count",
      type: "number",
      initial: 2,
      label: msg`Count`,
      max: 12,
      min: 0,
      step: 1,
    },
  ],
} satisfies MacroWorkbenchAuthorSpec);

export default workbench;
