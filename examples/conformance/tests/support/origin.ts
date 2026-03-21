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

  for (let index = 0; index < start; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { line, column };
}
