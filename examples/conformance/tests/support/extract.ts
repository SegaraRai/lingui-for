import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractedMessage, LinguiConfigNormalized } from "@lingui/conf";
import { astroExtractor } from "lingui-for-astro/extractor";
import { svelteExtractor } from "lingui-for-svelte/extractor";

import { transformOfficialCore, transformOfficialReact } from "./transforms.ts";

const linguiConfig: LinguiConfigNormalized = {
  catalogs: [],
  compileNamespace: "cjs",
  extractorParserOptions: {},
  fallbackLocales: {},
  format: undefined,
  locales: [],
  macro: {
    corePackage: ["@lingui/core/macro", "@lingui/macro"],
    jsxPackage: ["@lingui/react/macro", "@lingui/macro"],
  },
  orderBy: "messageId",
  rootDir: "/virtual",
  runtimeConfigModule: {
    i18n: ["@lingui/core", "i18n"],
    Trans: ["@lingui/react", "Trans"],
    useLingui: ["@lingui/react", "useLingui"],
  },
  sourceLocale: "en",
};

const parserPlugins: NonNullable<ParserOptions["plugins"]> = [
  "importAttributes",
  "explicitResourceManagement",
  "decoratorAutoAccessors",
  "deferredImportEvaluation",
  "typescript",
  "jsx",
  "decorators",
];

type FixtureReference =
  | {
      kind: "core";
      source: string;
    }
  | {
      kind: "react";
      source: string;
    };

const IGNORED_EXTRACT_KEYS = new Set([
  "column",
  "end",
  "filename",
  "line",
  "loc",
  "origin",
  "start",
]);

function getExtractorContext(): { linguiConfig: LinguiConfigNormalized } {
  return { linguiConfig };
}

function normalizeExtractedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeExtractedValue);
  }

  if (!value || typeof value !== "object") {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value
      .replaceAll("\r\n", "\n")
      .replaceAll(/[ \t]+\n/g, "\n")
      .trim();

    return normalized.includes("_i18n._(") || normalized.includes("/*i18n*/")
      ? normalized.replaceAll(/\s+/g, " ")
      : normalized;
  }

  const normalizedEntries = Object.entries(value)
    .filter(([key]) => !IGNORED_EXTRACT_KEYS.has(key))
    .map(
      ([key, entryValue]) =>
        [key, normalizeExtractedValue(entryValue)] as const,
    )
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  return Object.fromEntries(normalizedEntries);
}

function compareMessages(
  left: ExtractedMessage,
  right: ExtractedMessage,
): number {
  const leftKey = `${left.id ?? ""}\u0000${left.message ?? ""}\u0000${left.context ?? ""}`;
  const rightKey = `${right.id ?? ""}\u0000${right.message ?? ""}\u0000${right.context ?? ""}`;
  return leftKey.localeCompare(rightKey);
}

async function collectOfficialExtractedMessages(
  reference: FixtureReference,
  fixtureName: string,
): Promise<ExtractedMessage[]> {
  const transformed =
    reference.kind === "core"
      ? transformOfficialCore(reference.source)
      : transformOfficialReact(reference.source);
  const messages: ExtractedMessage[] = [];

  const origin =
    reference.kind === "core"
      ? `/virtual/${fixtureName}.reference.ts`
      : `/virtual/${fixtureName}.reference.tsx`;

  await extractFromFileWithBabel(
    origin,
    transformed,
    (message) => {
      messages.push(message);
    },
    getExtractorContext(),
    {
      plugins: parserPlugins,
    },
    true,
  );

  return messages.map((message) =>
    normalizeOfficialMessageOrigin(message, origin),
  );
}

function normalizeOfficialMessageOrigin(
  message: ExtractedMessage,
  origin: string,
): ExtractedMessage {
  if (!message.origin) {
    return message;
  }

  return {
    ...message,
    origin: [origin, message.origin[1], message.origin[2]],
  };
}

export async function extractOfficialCore(
  source: string,
  fixtureName = "reference",
): Promise<ExtractedMessage[]> {
  return await collectOfficialExtractedMessages(
    { kind: "core", source },
    fixtureName,
  );
}

export async function extractOfficialReact(
  source: string,
  fixtureName = "reference",
): Promise<ExtractedMessage[]> {
  return await collectOfficialExtractedMessages(
    { kind: "react", source },
    fixtureName,
  );
}

export async function extractSvelteFixture(
  source: string,
  fixtureName = "conformance",
): Promise<ExtractedMessage[]> {
  const messages: ExtractedMessage[] = [];

  await svelteExtractor.extract(
    `/virtual/${fixtureName}.svelte`,
    source,
    (message) => {
      messages.push(message);
    },
    getExtractorContext(),
  );

  return messages;
}

export async function extractAstroFixture(
  source: string,
  fixtureName = "conformance",
): Promise<ExtractedMessage[]> {
  const messages: ExtractedMessage[] = [];

  await astroExtractor.extract(
    `/virtual/${fixtureName}.astro`,
    source,
    (message) => {
      messages.push(message);
    },
    getExtractorContext(),
  );

  return messages;
}

export function normalizeExtractedMessages(
  messages: readonly ExtractedMessage[],
): unknown[] {
  const deduped = new Map<string, ExtractedMessage>();

  for (const message of messages) {
    const normalized = normalizeExtractedValue(message);
    deduped.set(JSON.stringify(normalized), message);
  }

  return [...deduped.values()]
    .sort(compareMessages)
    .map((message) => normalizeExtractedValue(message));
}
