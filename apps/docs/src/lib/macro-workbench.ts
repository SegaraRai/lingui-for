import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const WORKBENCH_LOCALE_REGISTRY = {
  en: {
    code: "en",
    label: msg`EN`,
  },
  ja: {
    code: "ja",
    label: msg`JA`,
  },
} as const;

export type MacroWorkbenchLocaleCode = keyof typeof WORKBENCH_LOCALE_REGISTRY;

export type MacroWorkbenchLocaleOption = {
  code: MacroWorkbenchLocaleCode;
  label: MessageDescriptor;
};

export type MacroWorkbenchScalar = boolean | number | string;

export type MacroWorkbenchCodeLanguage =
  | "astro"
  | "js"
  | "json"
  | "po"
  | "svelte"
  | "ts";

export type MacroWorkbenchCodeArtifact = {
  code: string;
  filename?: string;
  lang: MacroWorkbenchCodeLanguage;
};

type MacroWorkbenchBaseControl<
  TType extends string,
  TValue extends MacroWorkbenchScalar,
> = {
  id: string;
  initial: TValue;
  label: MessageDescriptor;
  type: TType;
};

export type MacroWorkbenchTextControl = MacroWorkbenchBaseControl<
  "text",
  string
> & {
  placeholder?: MessageDescriptor;
  width?: "lg" | "md" | "sm";
};

export type MacroWorkbenchNumberControl = MacroWorkbenchBaseControl<
  "number",
  number
> & {
  max?: number;
  min?: number;
  step?: number;
};

export type MacroWorkbenchSelectControl = MacroWorkbenchBaseControl<
  "select",
  string
> & {
  options: readonly {
    label: MessageDescriptor;
    value: string;
  }[];
};

export type MacroWorkbenchBooleanControl = MacroWorkbenchBaseControl<
  "boolean",
  boolean
> & {
  onLabel: MessageDescriptor;
  offLabel: MessageDescriptor;
};

export type MacroWorkbenchControl =
  | MacroWorkbenchBooleanControl
  | MacroWorkbenchNumberControl
  | MacroWorkbenchSelectControl
  | MacroWorkbenchTextControl;

export type MacroWorkbenchPreviewArtifact = {
  componentModule: string;
  initialProps: Record<string, MacroWorkbenchScalar>;
};

export type MacroWorkbenchInitialView = {
  result?: "compiledCatalog" | "preview" | "transformed";
  source?: "catalog" | "demo";
};

export type MacroWorkbenchSourceArtifacts = {
  catalogs: Partial<
    Record<MacroWorkbenchLocaleCode, MacroWorkbenchCodeArtifact>
  >;
  demo: MacroWorkbenchCodeArtifact;
};

export type MacroWorkbenchResultArtifacts = {
  compiledCatalogs: Partial<
    Record<MacroWorkbenchLocaleCode, MacroWorkbenchCodeArtifact>
  >;
  preview: MacroWorkbenchPreviewArtifact;
  transformed: MacroWorkbenchCodeArtifact;
};

export type MacroWorkbenchAuthorSpec = {
  controls?: readonly MacroWorkbenchControl[];
  initialView?: MacroWorkbenchInitialView;
  locale?: {
    initial?: MacroWorkbenchLocaleCode;
    supported?: readonly MacroWorkbenchLocaleCode[];
  };
};

export type MacroWorkbenchResolvedDefinition = {
  controls: readonly MacroWorkbenchControl[];
  id: string;
  initialValues: Record<string, MacroWorkbenchScalar>;
  initialView: Required<MacroWorkbenchInitialView>;
  locale: {
    initial: MacroWorkbenchLocaleCode;
    options: readonly MacroWorkbenchLocaleOption[];
  };
  result: MacroWorkbenchResultArtifacts;
  source: MacroWorkbenchSourceArtifacts;
};

type MacroWorkbenchPluginArtifacts = {
  id: string;
  result: MacroWorkbenchResultArtifacts;
  source: MacroWorkbenchSourceArtifacts;
};

const DEFAULT_INITIAL_VIEW: Required<MacroWorkbenchInitialView> = {
  result: "preview",
  source: "demo",
};

export function defineMacroWorkbench(
  spec: MacroWorkbenchAuthorSpec,
): MacroWorkbenchAuthorSpec {
  return spec;
}

export function getWorkbenchLocaleOptions(
  supported?: readonly MacroWorkbenchLocaleCode[],
): readonly MacroWorkbenchLocaleOption[] {
  const codes =
    supported && supported.length > 0
      ? supported
      : (Object.keys(WORKBENCH_LOCALE_REGISTRY) as MacroWorkbenchLocaleCode[]);

  return codes.map((code) => {
    const locale = WORKBENCH_LOCALE_REGISTRY[code];

    return {
      code,
      label: locale.label,
    };
  });
}

export function resolveMacroWorkbenchSpec(
  artifacts: MacroWorkbenchPluginArtifacts,
  authored: MacroWorkbenchAuthorSpec = {},
): MacroWorkbenchResolvedDefinition {
  const localeOptions = getWorkbenchLocaleOptions(authored.locale?.supported);
  const localeInitial =
    authored.locale?.initial ?? localeOptions[0]?.code ?? "en";
  const controls = authored.controls ?? [];
  const initialValues: Record<string, MacroWorkbenchScalar> = {
    locale: localeInitial,
  };

  for (const control of controls) {
    initialValues[control.id] = control.initial;
  }

  return {
    controls,
    id: artifacts.id,
    initialValues,
    initialView: {
      result: authored.initialView?.result ?? DEFAULT_INITIAL_VIEW.result,
      source: authored.initialView?.source ?? DEFAULT_INITIAL_VIEW.source,
    },
    locale: {
      initial: localeInitial,
      options: localeOptions,
    },
    result: {
      compiledCatalogs: pickArtifactsByLocale(
        artifacts.result.compiledCatalogs,
        localeOptions,
      ),
      preview: {
        ...artifacts.result.preview,
        initialProps: {
          ...artifacts.result.preview.initialProps,
          locale: localeInitial,
        },
      },
      transformed: artifacts.result.transformed,
    },
    source: {
      catalogs: pickArtifactsByLocale(artifacts.source.catalogs, localeOptions),
      demo: artifacts.source.demo,
    },
  };
}

function pickArtifactsByLocale<T>(
  artifacts: Partial<Record<MacroWorkbenchLocaleCode, T>>,
  localeOptions: readonly MacroWorkbenchLocaleOption[],
): Partial<Record<MacroWorkbenchLocaleCode, T>> {
  const next: Partial<Record<MacroWorkbenchLocaleCode, T>> = {};

  for (const option of localeOptions) {
    const artifact = artifacts[option.code];

    if (artifact) {
      next[option.code] = artifact;
    }
  }

  return next;
}
