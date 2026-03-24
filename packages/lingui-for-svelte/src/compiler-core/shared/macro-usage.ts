import { REACTIVE_MACRO_PREFIX } from "./constants.ts";

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
