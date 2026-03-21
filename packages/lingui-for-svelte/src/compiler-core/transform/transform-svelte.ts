import type { RawSourceMap } from "source-map";

import { stripQuery } from "lingui-for-shared/compiler";

import { analyzeSvelte } from "../analysis/svelte-analysis.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import {
  EXPORT_CREATE_LINGUI_ACCESSORS,
  PACKAGE_RUNTIME,
  RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS,
  RUNTIME_BINDING_CONTEXT,
  RUNTIME_BINDING_GET_I18N,
  RUNTIME_BINDING_TRANSLATE,
} from "../shared/constants.ts";
import { createScriptFilename } from "../shared/paths.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import { createUniqueNameAllocator } from "./identifier-allocation.ts";
import { splitSyntheticDeclarations } from "./runtime-trans-lowering.ts";
import {
  advanceGeneratedOffset,
  buildDirectProgramMap,
  createIndexedSourceMap,
  createUntouchedChunkMap,
  type GeneratedOffset,
} from "./source-map.ts";
import { buildCombinedProgram } from "./synthetic-program.ts";
import type { SvelteTransformResult } from "./types.ts";

type RuntimeBindingsForInjection = {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
  transComponent: string;
};

type ReplacementChunk = {
  start: number;
  end: number;
  code: string;
  map: RawSourceMap | null;
};

type InjectedScript = {
  prelude: string;
  body: string;
  suffix: string;
  code: string;
};

export function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): SvelteTransformResult {
  const analysis = analyzeSvelte(source, options.filename);
  const linguiConfig = normalizeLinguiConfig(options.linguiConfig);
  const runtimeBindings = createRuntimeBindings(
    options.filename,
    analysis.instance?.content ?? "",
    analysis.instance?.lang ?? "ts",
  );
  const filename = stripQuery(options.filename);
  const mapFile = getSourceMapFileName(filename);
  const replacements: ReplacementChunk[] = [];

  if (analysis.module) {
    const transformedModule = transformProgram(analysis.module.content, {
      extract: false,
      filename: createScriptFilename(
        options.filename,
        "module",
        analysis.module.lang,
      ),
      lang: analysis.module.lang,
      linguiConfig,
      translationMode: "raw",
      inputSourceMap: buildDirectProgramMap(
        source,
        options.filename,
        analysis.module.contentStart,
        analysis.module.content,
      ),
    });

    replacements.push({
      start: analysis.module.contentStart,
      end: analysis.module.contentEnd,
      code: transformedModule.code,
      map: transformedModule.map,
    });
  }

  if (
    analysis.instance ||
    analysis.expressions.length > 0 ||
    analysis.components.length > 0
  ) {
    const combined = buildCombinedProgram(
      source,
      options.filename,
      analysis.instance,
      analysis.expressions,
      analysis.components,
    );
    const transformedInstance = transformProgram(combined.code, {
      extract: false,
      filename: createScriptFilename(
        options.filename,
        "instance",
        analysis.instance?.lang ?? "ts",
      ),
      lang: analysis.instance?.lang ?? "ts",
      linguiConfig,
      translationMode: "svelte-context",
      runtimeBindings,
      inputSourceMap: combined.map,
    });
    const split = splitSyntheticDeclarations(
      transformedInstance,
      runtimeBindings.transComponent,
    );
    const expressionsCode = Array.from(split.expressionReplacements.values())
      .map((entry) => entry.code)
      .join("\n");
    const componentsCode = Array.from(split.componentReplacements.values())
      .map((entry) => entry.code)
      .join("\n");
    const needsLinguiContextBindings =
      split.script.code.includes(runtimeBindings.getI18n) ||
      split.script.code.includes(runtimeBindings.translate) ||
      expressionsCode.includes(runtimeBindings.getI18n) ||
      expressionsCode.includes(runtimeBindings.translate);
    const needsTransComponentBinding = componentsCode.includes(
      runtimeBindings.transComponent,
    );
    const injectedScript =
      needsLinguiContextBindings || needsTransComponentBinding
        ? injectRuntimeBindings(
            split.script.code,
            runtimeBindings,
            needsLinguiContextBindings,
            needsTransComponentBinding,
          )
        : {
            prelude: "",
            body: split.script.code,
            suffix: "",
            code: split.script.code,
          };
    const formattedScript = analysis.instance
      ? formatScriptContent(injectedScript.code, analysis.instance.content)
      : injectedScript.code;

    analysis.expressions.forEach((expression) => {
      const replacement = split.expressionReplacements.get(expression.index);
      if (replacement) {
        replacements.push({
          start: expression.start,
          end: expression.end,
          code: replacement.code,
          map: replacement.map,
        });
      }
    });

    analysis.components.forEach((component) => {
      const replacement = split.componentReplacements.get(component.index);
      if (replacement) {
        replacements.push({
          start: component.start,
          end: component.end,
          code: replacement.code,
          map: replacement.map,
        });
      }
    });

    if (analysis.instance) {
      replacements.push(
        ...createScriptReplacementChunks(
          analysis.instance.contentStart,
          analysis.instance.content,
          formattedScript,
          split.script.map,
          mapFile,
        ),
      );
    } else if (formattedScript.trim().length > 0) {
      const block = `<script>\n${formattedScript}\n</script>`;
      const insertionStart = analysis.module ? analysis.module.end : 0;

      replacements.push({
        start: insertionStart,
        end: insertionStart,
        code: analysis.module ? `\n\n${block}` : `${block}\n\n`,
        map: null,
      });
    }
  }

  return buildOutputWithIndexedMap(source, filename, mapFile, replacements);
}

function createRuntimeBindings(
  filename: string,
  instanceCode: string,
  lang: "js" | "ts",
): RuntimeBindingsForInjection {
  const allocateName = createUniqueNameAllocator(instanceCode, {
    filename: createScriptFilename(filename, "instance", lang),
    lang,
  });

  return {
    createLinguiAccessors: allocateName(EXPORT_CREATE_LINGUI_ACCESSORS),
    context: allocateName(RUNTIME_BINDING_CONTEXT),
    getI18n: allocateName(RUNTIME_BINDING_GET_I18N),
    translate: allocateName(RUNTIME_BINDING_TRANSLATE),
    transComponent: allocateName(RUNTIME_BINDING_COMPONENT_RUNTIME_TRANS),
  };
}

function injectRuntimeBindings(
  code: string,
  runtimeBindings: RuntimeBindingsForInjection,
  includeLinguiContext: boolean,
  includeTransComponent: boolean,
): InjectedScript {
  const prelude: string[] = [];
  const suffix: string[] = [];

  if (includeLinguiContext && includeTransComponent) {
    prelude.push(
      `import { RuntimeTrans as ${runtimeBindings.transComponent}, createLinguiAccessors as ${runtimeBindings.createLinguiAccessors} } from "${PACKAGE_RUNTIME}";\n`,
    );
  } else if (includeLinguiContext) {
    prelude.push(
      `import { createLinguiAccessors as ${runtimeBindings.createLinguiAccessors} } from "${PACKAGE_RUNTIME}";\n`,
    );
  } else if (includeTransComponent) {
    prelude.push(
      `import { RuntimeTrans as ${runtimeBindings.transComponent} } from "${PACKAGE_RUNTIME}";\n`,
    );
  }

  if (includeLinguiContext) {
    prelude.push(
      `const ${runtimeBindings.context} = ${runtimeBindings.createLinguiAccessors}();\n`,
      `const ${runtimeBindings.getI18n} = ${runtimeBindings.context}.getI18n;\n`,
      `const ${runtimeBindings.translate} = ${runtimeBindings.context}._;\n`,
    );
    suffix.push(`${runtimeBindings.context}.prime();\n`);
  }

  const preludeCode = prelude.join("");
  const suffixCode = suffix.join("");

  if (code.trim().length === 0) {
    return {
      prelude: preludeCode,
      body: "",
      suffix: suffixCode,
      code: `${preludeCode}${suffixCode}`,
    };
  }

  const wrappedPrelude = preludeCode.length > 0 ? `${preludeCode}\n` : "";
  const wrappedSuffix = suffixCode.length > 0 ? `\n${suffixCode}` : "";

  return {
    prelude: wrappedPrelude,
    body: code,
    suffix: wrappedSuffix,
    code: `${wrappedPrelude}${code}${wrappedSuffix}`,
  };
}

function buildOutputWithIndexedMap(
  source: string,
  filename: string,
  mapFile: string,
  replacements: ReplacementChunk[],
): SvelteTransformResult {
  const sorted = replacements
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const sections: Array<{
    offset: { line: number; column: number };
    map: RawSourceMap;
  }> = [];
  let cursor = 0;
  let code = "";
  let offset: GeneratedOffset = { line: 0, column: 0 };

  for (const replacement of sorted) {
    if (replacement.start < cursor) {
      continue;
    }

    const untouched = source.slice(cursor, replacement.start);
    const untouchedMap = createUntouchedChunkMap(
      source,
      mapFile,
      cursor,
      replacement.start,
    );

    code += untouched;
    if (untouchedMap) {
      sections.push({ offset, map: untouchedMap });
    }
    offset = advanceGeneratedOffset(offset, untouched);

    code += replacement.code;
    if (replacement.map) {
      sections.push({ offset, map: replacement.map });
    }
    offset = advanceGeneratedOffset(offset, replacement.code);
    cursor = replacement.end;
  }

  const tail = source.slice(cursor);
  const tailMap = createUntouchedChunkMap(
    source,
    mapFile,
    cursor,
    source.length,
  );

  code += tail;
  if (tailMap) {
    sections.push({ offset, map: tailMap });
  }

  return {
    code,
    map: {
      ...createIndexedSourceMap(mapFile, sections),
      sources: [mapFile],
      sourcesContent: [source],
    },
  };
}

function getSourceMapFileName(filename: string): string {
  const segments = filename.split(/[\\/]/);
  return segments.at(-1) ?? filename;
}

function formatScriptContent(code: string, originalContent: string): string {
  const indent = detectScriptIndent(originalContent);
  const body = code
    .split("\n")
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join("\n");
  const withLeadingNewline =
    originalContent.startsWith("\n") && !body.startsWith("\n")
      ? `\n${body}`
      : body;

  return originalContent.endsWith("\n") && !withLeadingNewline.endsWith("\n")
    ? `${withLeadingNewline}\n`
    : withLeadingNewline;
}

function detectScriptIndent(content: string): string {
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0];
    if (indent != null) {
      return indent;
    }
  }

  return "";
}

function createScriptReplacementChunks(
  scriptStart: number,
  original: string,
  replacement: string,
  _bodyMap: RawSourceMap | null,
  _mapFile: string,
): ReplacementChunk[] {
  if (original === replacement) {
    return [];
  }

  const originalLines = splitLines(original);
  const replacementLines = splitLines(replacement);
  const lcs = Array.from({ length: originalLines.length + 1 }, () =>
    Array.from<number>({ length: replacementLines.length + 1 }).fill(0),
  );

  for (let left = originalLines.length - 1; left >= 0; left -= 1) {
    for (let right = replacementLines.length - 1; right >= 0; right -= 1) {
      lcs[left][right] =
        originalLines[left] === replacementLines[right]
          ? (lcs[left + 1]?.[right + 1] ?? 0) + 1
          : Math.max(lcs[left + 1]?.[right] ?? 0, lcs[left]?.[right + 1] ?? 0);
    }
  }

  const replacements: ReplacementChunk[] = [];
  let left = 0;
  let right = 0;
  let originalOffset = 0;
  let replacementOffset = 0;
  let pendingOriginalStart: number | null = null;
  let pendingReplacementStart: number | null = null;

  const flush = (): void => {
    if (
      pendingOriginalStart == null ||
      pendingReplacementStart == null ||
      (originalOffset === pendingOriginalStart &&
        replacementOffset === pendingReplacementStart)
    ) {
      pendingOriginalStart = null;
      pendingReplacementStart = null;
      return;
    }

    replacements.push({
      start: scriptStart + pendingOriginalStart,
      end: scriptStart + originalOffset,
      code: replacement.slice(pendingReplacementStart, replacementOffset),
      map: null,
    });
    pendingOriginalStart = null;
    pendingReplacementStart = null;
  };

  while (left < originalLines.length || right < replacementLines.length) {
    if (
      left < originalLines.length &&
      right < replacementLines.length &&
      originalLines[left] === replacementLines[right]
    ) {
      flush();
      originalOffset += originalLines[left]?.length ?? 0;
      replacementOffset += replacementLines[right]?.length ?? 0;
      left += 1;
      right += 1;
      continue;
    }

    pendingOriginalStart ??= originalOffset;
    pendingReplacementStart ??= replacementOffset;

    if (
      right >= replacementLines.length ||
      (left < originalLines.length &&
        (lcs[left + 1]?.[right] ?? 0) >= (lcs[left]?.[right + 1] ?? 0))
    ) {
      originalOffset += originalLines[left]?.length ?? 0;
      left += 1;
    } else {
      replacementOffset += replacementLines[right]?.length ?? 0;
      right += 1;
    }
  }

  flush();
  return replacements;
}

function splitLines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}
