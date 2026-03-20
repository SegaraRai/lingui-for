/**
 * Removes a query suffix from an import id or filename-like string.
 */
export function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}
