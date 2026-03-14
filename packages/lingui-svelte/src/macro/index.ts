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

export { Trans, useLingui } from "../runtime/index.ts";

type LinguiMacroT = typeof linguiT;
type ReactiveMacroTranslator = Readable<LinguiMacroT> &
  LinguiMacroT & {
    raw: LinguiMacroT;
  };

export const t = Object.assign(linguiT as ReactiveMacroTranslator, {
  raw: linguiT,
  subscribe() {
    throw new Error(
      'lingui-svelte/macro "t" must be compiled before it can be subscribed to.',
    );
  },
});
