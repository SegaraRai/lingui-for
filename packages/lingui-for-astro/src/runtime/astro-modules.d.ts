declare module "*.astro" {
  import type { AstroComponentFactory } from "astro/runtime/server/index.js";

  const AstroComponent: AstroComponentFactory;
  export default AstroComponent;
}
