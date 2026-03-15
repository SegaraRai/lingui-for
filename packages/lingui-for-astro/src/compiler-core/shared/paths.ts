const TRANSFORMABLE_SCRIPT_RE = /\.[cm]?[jt]sx?$/i;

export function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

export function isTransformableScript(filename: string): boolean {
  return TRANSFORMABLE_SCRIPT_RE.test(stripQuery(filename));
}
