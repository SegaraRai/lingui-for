import type { MarkupFramework } from "../../../types.ts";
import type {
  MarkupFacadeModule,
  ResolveFacadeSourceSpecifier,
} from "../types.ts";
import { createAstroFacadeModule } from "./astro.ts";
import { createSvelteFacadeModule } from "./svelte.ts";

export type FrameworkHandler = {
  extension: string;
  createFacadeModule: (
    source: string,
    filename: string,
    relativePath: string,
    resolveFacadeSourceSpecifier?: ResolveFacadeSourceSpecifier,
  ) => MarkupFacadeModule;
};

export const FRAMEWORK_HANDLERS: Record<MarkupFramework, FrameworkHandler> = {
  astro: {
    extension: ".astro",
    createFacadeModule: createAstroFacadeModule,
  },
  svelte: {
    extension: ".svelte",
    createFacadeModule: createSvelteFacadeModule,
  },
};
