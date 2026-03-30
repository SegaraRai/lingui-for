export type SourceLocation = {
  line: number;
  column: number;
};

export function findSourceLocation(
  source: string,
  needle: string | RegExp,
): SourceLocation {
  const start = findIndex(source, needle);
  if (start < 0) {
    throw new Error(`Needle not found in source: ${needle}`);
  }

  let line = 1;
  let column = 0;

  for (const char of source.slice(0, start)) {
    if (char === "\n") {
      line += 1;
      column = 0;
    } else {
      column += char.length;
    }
  }

  return { line, column };
}

function findIndex(source: string, needle: string | RegExp): number {
  if (typeof needle === "string") {
    return source.indexOf(needle);
  }

  const flags = needle.flags.includes("g") ? needle.flags : `${needle.flags}g`;
  const expression = new RegExp(needle.source, flags);
  const matches = [...source.matchAll(expression)];
  if (matches.length !== 1) {
    return -1;
  }
  return matches[0]?.index ?? -1;
}
