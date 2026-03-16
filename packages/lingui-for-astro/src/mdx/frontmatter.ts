export interface StrippedFrontmatter {
  content: string;
  frontmatter: string | null;
}

export function stripMdxFrontmatter(source: string): StrippedFrontmatter {
  if (!source.startsWith("---")) {
    return {
      content: source,
      frontmatter: null,
    };
  }

  const closingMatch = source.slice(3).match(/(?:\r?\n)---(?:\r?\n|$)/);
  if (!closingMatch || closingMatch.index == null) {
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
