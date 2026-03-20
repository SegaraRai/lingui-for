import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import type { MarkupImportPluginOptions } from "../../types.ts";
import { normalizeGlobPatterns } from "../fs/filters.ts";
import {
  dirnamePath,
  joinPath,
  normalizePath,
  resolveRelativeSpecifier,
} from "../fs/paths.ts";
import { FRAMEWORK_HANDLERS } from "../markup/frameworks/registry.ts";
import {
  createProxyModuleCode,
  createProxyRequest,
  isProxyRequest,
  isPublicRequest,
  parseProxyRequest,
  shouldPreserveRelativeMarkupImport,
  stripKnownQuery,
} from "../virtual/proxy.ts";
import { createBundlerOptionsHook } from "./bundler-options.ts";
import {
  cleanupGeneratedState,
  createLifecycleContext,
  emitGeneratedMarkupAssets,
  scanGeneratedMarkups,
} from "./lifecycle.ts";
import type { ScanFilter } from "./types.ts";

export const unpluginFactory: UnpluginFactory<
  MarkupImportPluginOptions | undefined
> = (options = {}) => {
  const projectRoot = normalizePath(options.rootDir ?? process.cwd());
  const sourceDir = normalizePath(
    options.sourceDir ?? joinPath(projectRoot, "src"),
  );
  const tempDir = joinPath(sourceDir, ".unplugin-markup-import");
  const frameworks = options.frameworks ?? ["svelte"];
  const handlers = frameworks.map((framework) => FRAMEWORK_HANDLERS[framework]);
  const handledExtensions = handlers.map((handler) => handler.extension);
  const scanFilter: ScanFilter = {
    include: normalizeGlobPatterns(options.include),
    exclude: normalizeGlobPatterns(options.exclude),
  };
  const lifecycleContext = createLifecycleContext();
  const applyBundlerOptions = createBundlerOptionsHook(
    sourceDir,
    tempDir,
    handlers,
    scanFilter,
    lifecycleContext,
  );

  return {
    name: "unplugin-markup-import",
    rollup: {
      options(options) {
        return applyBundlerOptions(options);
      },
    },
    rolldown: {
      options(options) {
        return applyBundlerOptions(options);
      },
    },
    vite: {
      options(options) {
        return applyBundlerOptions(options);
      },
    },
    buildStart() {
      scanGeneratedMarkups(
        sourceDir,
        tempDir,
        handlers,
        scanFilter,
        lifecycleContext,
      );
      emitGeneratedMarkupAssets(this, lifecycleContext);
    },
    resolveId(source, importer) {
      if (isPublicRequest(source)) {
        return {
          external: true,
          id: stripKnownQuery(source),
        };
      }

      if (isProxyRequest(source)) {
        return source;
      }

      if (
        !importer ||
        !shouldPreserveRelativeMarkupImport(source, importer, handledExtensions)
      ) {
        return null;
      }

      const sourceId = resolveRelativeSpecifier(
        dirnamePath(stripKnownQuery(importer)),
        source,
      );
      const generatedMarkup = lifecycleContext.generatedMarkups.get(sourceId);
      if (!generatedMarkup) {
        return null;
      }

      return createProxyRequest(source);
    },
    load(id) {
      const publicSpecifier = parseProxyRequest(id);
      if (publicSpecifier == null) {
        return null;
      }
      return createProxyModuleCode(publicSpecifier);
    },
    buildEnd() {
      cleanupGeneratedState(tempDir, lifecycleContext);
    },
  };
};

export const unplugin: UnpluginInstance<MarkupImportPluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
