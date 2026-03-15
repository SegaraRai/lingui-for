import { createUnplugin, type UnpluginInstance } from "unplugin";

import { unpluginFactory } from "./internal/plugin.ts";
import type { LinguiMacroPluginOptions } from "./types.ts";

export { unpluginFactory } from "./internal/plugin.ts";

export const unplugin: UnpluginInstance<LinguiMacroPluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
