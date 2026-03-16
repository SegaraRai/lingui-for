/**
 * Result of separating YAML-style MDX frontmatter from the remaining document content.
 */
export interface StrippedFrontmatter {
  /**
   * MDX document content after removing the leading frontmatter block.
   */
  content: string;
  /**
   * Original frontmatter block including fence lines, or `null` when absent.
   */
  frontmatter: string | null;
}

/**
 * Strips a leading `--- ... ---` frontmatter block from MDX source.
 *
 * @param source Original MDX source text.
 * @returns The remaining content plus the extracted frontmatter block when present.
 */
export function stripMdxFrontmatter(source: string): StrippedFrontmatter {
  if (!source.startsWith("---")) {
    return {
      content: source,
      frontmatter: null,
    };
  }

  const closingMatch = source.slice(3).match(/(?:\r?\n)---(?:\r?\n|$)/);
  if (closingMatch?.index == null) {
    return {
      content: source,
      frontmatter: null,
    };
  }

  const frontmatterEnd = 3 + closingMatch.index + closingMatch[0].length;
  return {
    content: source.slice(frontmatterEnd),
    frontmatter: source.slice(0, frontmatterEnd),
  };
}
