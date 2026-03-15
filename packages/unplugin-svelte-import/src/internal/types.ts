import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type RewriteSvelteImportContext = {
  filename: string;
  scriptKind: "instance" | "module";
};

export type RewriteSvelteImport = (
  specifier: string,
  context: RewriteSvelteImportContext,
) => string | null | undefined;

export type RewriteSvelteImportsResult = {
  code: string;
  changed: boolean;
};

export type ScriptRange = {
  content: string;
  contentStart: number;
  kind: "instance" | "module";
  lang: "js" | "ts";
};

export type InputDeclaration =
  | TSESTree.ImportDeclaration
  | TSESTree.ExportNamedDeclaration
  | TSESTree.ExportAllDeclaration;

export type FacadeBinding = {
  exportName: string;
  localName: string;
  importedName: string | null;
  kind: "named" | "default" | "namespace";
  typeOnly: boolean;
};

export type FacadeDeclaration = {
  source: string;
  specifiers: FacadeBinding[];
  sideEffectOnly: boolean;
};

export type SvelteFacadeModule = {
  relativePath: string;
  filename: string;
  assetFileName: string;
  facadeFileName: string | null;
  facadeCode: string | null;
  facadeDtsFileName: string | null;
  facadeDtsCode: string | null;
  rewrittenCode: string;
};

export type StoredFacadeModule = SvelteFacadeModule & {
  facadeId: string | null;
};

export type ImportSpecifierNode =
  | TSESTree.ImportSpecifier
  | TSESTree.ImportDefaultSpecifier
  | TSESTree.ImportNamespaceSpecifier;
