import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(currentDir, "..");
const workspaceDir = resolve(exampleDir, "..", "..");

type ExtractorModule = typeof import("lingui-svelte/extractor");
type ExtractedMessage = {
  message?: string;
};

let extractorModule: ExtractorModule;

async function collectMessages(
  filename: string,
  source: string,
  extract: (
    filename: string,
    source: string,
    onMessageExtracted: (message: ExtractedMessage) => void,
  ) => Promise<void> | void,
): Promise<ExtractedMessage[]> {
  const messages: ExtractedMessage[] = [];
  await extract(filename, source, (message) => {
    messages.push(message);
  });
  return messages;
}

describe.sequential("extractor e2e", () => {
  beforeAll(async () => {
    execSync("pnpm --filter lingui-svelte build", {
      cwd: workspaceDir,
      stdio: "inherit",
    });

    extractorModule = await import("lingui-svelte/extractor");
  }, 60_000);

  it("extracts tagged template literals from actual example files", async () => {
    const playgroundPagePath = resolve(exampleDir, "src/routes/playground/+page.svelte");
    const messagesPath = resolve(exampleDir, "src/lib/i18n/messages.ts");

    const [playgroundPage, messagesFile] = await Promise.all([
      readFile(playgroundPagePath, "utf8"),
      readFile(messagesPath, "utf8"),
    ]);

    const [svelteMessages, tsMessages] = await Promise.all([
      collectMessages(
        playgroundPagePath,
        playgroundPage,
        extractorModule.svelteExtractor.extract,
      ),
      collectMessages(
        messagesPath,
        messagesFile,
        extractorModule.jstsExtractor.extract,
      ),
    ]);

    const extractedMessages = [...svelteMessages, ...tsMessages]
      .map((message) => message.message)
      .filter((message): message is string => Boolean(message));

    expect(extractedMessages).toContain("Tagged template literal from route script.");
    expect(extractedMessages).toContain("Tagged template literal from markup expression.");
    expect(extractedMessages).toContain("Tagged template descriptor from raw TypeScript.");
  });
});
