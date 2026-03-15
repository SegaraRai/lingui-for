import { createUnplugin, type UnpluginInstance } from "unplugin";

import { unpluginFactory } from "./internal/plugin.ts";
import type { SvelteImportPluginOptions } from "./types.ts";

export { unpluginFactory } from "./internal/plugin.ts";

export const unplugin: UnpluginInstance<SvelteImportPluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
