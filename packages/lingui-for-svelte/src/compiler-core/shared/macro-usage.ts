import { REACTIVE_MACRO_PREFIX } from "./constants.ts";

export type StripRange = {
  start: number;
  end: number;
};

export function applyBoundaryStripRanges(
  start: number,
  end: number,
  stripRanges: ReadonlyArray<StripRange>,
): { normalizedStart: number; normalizedEnd: number } {
  let normalizedStart = start;
  let normalizedEnd = end;

  while (true) {
    const leading = stripRanges.find(
      (range) => range.start === normalizedStart,
    );
    if (!leading) {
      break;
    }
    normalizedStart = leading.end;
  }

  while (true) {
    const trailing = stripRanges.find((range) => range.end === normalizedEnd);
    if (!trailing) {
      break;
    }
    normalizedEnd = trailing.start;
  }

  return { normalizedStart, normalizedEnd };
}

export function buildInvalidDirectMacroUsageMessage(localName: string): string {
  const reactiveName = `${REACTIVE_MACRO_PREFIX}${localName}`;
  const replacement =
    localName === "t"
      ? `\`${reactiveName}(...)\`, \`${reactiveName}\`...\`\`, \`${localName}.eager(...)\`, or \`${localName}.eager\`...\`\``
      : `\`${reactiveName}(...)\` or \`${localName}.eager(...)\``;
  const detail =
    localName === "t"
      ? "Bare `t` in `.svelte` files is not allowed because it loses locale reactivity."
      : `Bare \`${localName}\` in \`.svelte\` files is only allowed when building a descriptor, for example inside \`msg(...)\`, \`defineMessage(...)\`, \`$t(...)\`, or a \`message:\` field.`;

  return `${detail} Use ${replacement} instead.`;
}
