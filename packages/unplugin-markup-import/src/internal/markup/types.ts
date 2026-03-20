import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type RewriteMarkupImportContext = {
  filename: string;
  scriptKind: "instance" | "module" | "frontmatter";
  markupExtension: string;
};

export type ResolveFacadeSourceSpecifierContext = {
  filename: string;
  relativePath: string;
  markupExtension: string;
  resolvedSource: string;
};

export type ResolveFacadeSourceSpecifier = (
  specifier: string,
  context: ResolveFacadeSourceSpecifierContext,
) => string;

export type ShouldExternalizeMarkupImport = (
  specifier: string,
  context: ResolveFacadeSourceSpecifierContext,
) => boolean;

export type RewriteMarkupImport = (
  specifier: string,
  context: RewriteMarkupImportContext,
) => string | null | undefined;

export type RewriteMarkupImportsResult = {
  code: string;
  changed: boolean;
};

export type ScriptRange = {
  content: string;
  contentStart: number;
  kind: "instance" | "module" | "frontmatter";
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

export type MarkupFacadeModule = {
  relativePath: string;
  filename: string;
  assetFileName: string;
  facadeFileName: string | null;
  facadeCode: string | null;
  rewrittenCode: string;
};

export type ImportSpecifierNode =
  | TSESTree.ImportSpecifier
  | TSESTree.ImportDefaultSpecifier
  | TSESTree.ImportNamespaceSpecifier;
