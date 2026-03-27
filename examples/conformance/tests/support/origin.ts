export type SourceLocation = {
  line: number;
  column: number;
};

export function findSourceLocation(
  source: string,
  needle: string,
): SourceLocation {
  const start = source.indexOf(needle);

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
