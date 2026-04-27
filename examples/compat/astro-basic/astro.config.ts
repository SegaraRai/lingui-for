import { defineConfig } from "astro/config";

import linguiForAstro from "lingui-for-astro/integration";

export default defineConfig({
  integrations: [linguiForAstro()],
});
