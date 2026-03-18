import { msg } from "@lingui/core/macro";

import {
  defineMacroWorkbench,
  type MacroWorkbenchAuthorSpec,
} from "../../../lib/macro-workbench.ts";

const workbench = defineMacroWorkbench({
  controls: [
    {
      id: "name",
      type: "text",
      initial: "Lingui",
      label: msg`Name`,
      placeholder: msg`Enter a name`,
    },
  ],
} satisfies MacroWorkbenchAuthorSpec);

export default workbench;
