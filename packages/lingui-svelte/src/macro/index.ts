import { t as linguiT } from "@lingui/core/macro";
import type { Readable } from "svelte/store";

export {
  defineMessage,
  msg,
  ph,
  plural,
  select,
  selectOrdinal,
} from "@lingui/core/macro";

export { Trans } from "../runtime/index.ts";

type LinguiMacroT = typeof linguiT;
type ReactiveMacroTranslator = Readable<LinguiMacroT> & LinguiMacroT;

export const t = Object.assign(linguiT as ReactiveMacroTranslator, {
  subscribe() {
    throw new Error(
      'lingui-svelte/macro "t" must be compiled before it can be subscribed to.',
    );
  },
});
