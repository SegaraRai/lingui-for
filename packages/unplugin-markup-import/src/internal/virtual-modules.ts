import {
  dirnamePath,
  normalizePath,
  resolveRelativeSpecifier,
} from "./path.ts";

const VIRTUAL_PROXY_PREFIX = "\0unplugin-markup-import:proxy:";
const VIRTUAL_FACADE_PREFIX = "\0unplugin-markup-import:facade:";
const SCAN_QUERY = "?unplugin-markup-import-scan";
const PUBLIC_QUERY = "?unplugin-markup-import-public";

export function isScanRequest(id: string): boolean {
  return id.endsWith(SCAN_QUERY);
}

export function isPublicRequest(id: string): boolean {
  return id.endsWith(PUBLIC_QUERY);
}

export function stripKnownQuery(value: string): string {
  return value.replace(SCAN_QUERY, "").replace(PUBLIC_QUERY, "");
}

export function shouldPreserveRelativeMarkupImport(
  specifier: string,
  importer: string | undefined,
  extensions: readonly string[],
): boolean {
  return Boolean(
    importer &&
    specifier.startsWith(".") &&
    extensions.some((extension) => specifier.endsWith(extension)),
  );
}

export function createProxyId(
  sourceId: string,
  publicSpecifier: string,
): string {
  return `${VIRTUAL_PROXY_PREFIX}${encodeSegment(sourceId)}:${encodeSegment(publicSpecifier)}`;
}

export function parseProxyId(
  id: string,
): { sourceId: string; publicSpecifier: string } | null {
  if (!id.startsWith(VIRTUAL_PROXY_PREFIX)) {
    return null;
  }

  const payload = id.slice(VIRTUAL_PROXY_PREFIX.length);
  const separatorIndex = payload.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  return {
    sourceId: decodeSegment(payload.slice(0, separatorIndex)),
    publicSpecifier: decodeSegment(payload.slice(separatorIndex + 1)),
  };
}

export function createFacadeId(sourceId: string): string {
  return `${VIRTUAL_FACADE_PREFIX}${encodeSegment(sourceId)}`;
}

export function parseFacadeSourceId(id: string): string {
  if (!id.startsWith(VIRTUAL_FACADE_PREFIX)) {
    return "";
  }

  return decodeSegment(id.slice(VIRTUAL_FACADE_PREFIX.length));
}

export function resolveScanSourceId(
  source: string,
  importer: string | undefined,
): string | null {
  const bareSource = source.slice(0, -SCAN_QUERY.length);

  if (bareSource.startsWith(".")) {
    if (!importer) {
      return null;
    }

    return resolveRelativeSpecifier(
      dirnamePath(stripKnownQuery(importer)),
      bareSource,
    );
  }

  return normalizePath(bareSource);
}

export function createProxyModuleCode(
  sourceId: string,
  publicSpecifier: string,
): string {
  return [
    `import ${JSON.stringify(`${sourceId}${SCAN_QUERY}`)};`,
    `export { default } from ${JSON.stringify(`${publicSpecifier}${PUBLIC_QUERY}`)};`,
  ].join("\n");
}

export function createScanModuleCode(
  childSourceIds: readonly string[],
): string {
  if (childSourceIds.length === 0) {
    return "export {};";
  }

  return childSourceIds
    .map(
      (childSourceId) =>
        `import ${JSON.stringify(`${childSourceId}${SCAN_QUERY}`)};`,
    )
    .join("\n");
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value);
}
