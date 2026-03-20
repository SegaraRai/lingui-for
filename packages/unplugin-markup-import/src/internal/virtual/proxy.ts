const PUBLIC_QUERY = "?unplugin-markup-import-public";
const PROXY_PREFIX = "\0unplugin-markup-import-proxy:";

export function isPublicRequest(id: string): boolean {
  return id.endsWith(PUBLIC_QUERY);
}

export function isProxyRequest(id: string): boolean {
  return id.startsWith(PROXY_PREFIX);
}

export function stripKnownQuery(value: string): string {
  return value.replace(PUBLIC_QUERY, "");
}

export function createProxyRequest(publicSpecifier: string): string {
  return `${PROXY_PREFIX}${encodeURIComponent(publicSpecifier)}`;
}

export function parseProxyRequest(id: string): string | null {
  if (!isProxyRequest(id)) {
    return null;
  }

  return decodeURIComponent(id.slice(PROXY_PREFIX.length));
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

export function createProxyModuleCode(publicSpecifier: string): string {
  return `export { default } from ${JSON.stringify(`${publicSpecifier}${PUBLIC_QUERY}`)};\n`;
}
