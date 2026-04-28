export type PackageSection =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies";

export type PackagePatch = {
  path: string;
  sections: Partial<Record<PackageSection, Record<string, string>>>;
};

export type CompatCase = {
  name: string;
  description: string;
  lingui: LinguiMajor;
  assertions: CompatAssertions;
  patches: PackagePatch[];
  projects: CompatProject[];
};

export type CompatProject = {
  cwd: string;
  commands: string[][];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  localPackages?: Partial<Record<PackageSection, LocalPackageName[]>>;
  assertions?: PackageVersionAssertion[];
  snapshots?: string[];
};

export type CompatCaseConfig = Omit<CompatCase, "assertions"> & {
  assertions?: Partial<CompatAssertions>;
};

export type CompatAssertions = {
  packages: PackageVersionAssertion[];
};

export type PackageVersionAssertion = {
  cwd: string;
  name: string;
  major: string;
  issuerPackage?: string;
  source?: "packageJson" | "moduleVersion";
};

export type Options = {
  names: string[];
  list: boolean;
  keep: boolean;
  skipInstall: boolean;
  updateSnapshots: boolean;
  tmpRoot: string | undefined;
};

export const PACKAGE = {
  frameworkCore: "@lingui-for/framework-core",
  linguiAstro: "lingui-for-astro",
  linguiSvelte: "lingui-for-svelte",
  markupImport: "unplugin-markup-import",
  macro: "unplugin-lingui-macro",
  linguiBabelMacro: "@lingui/babel-plugin-lingui-macro",
  linguiCli: "@lingui/cli",
  linguiConf: "@lingui/conf",
  linguiCore: "@lingui/core",
  vite: "vite",
  vitePlus: "vite-plus",
  typesNode: "@types/node",
  typescript: "typescript",
} as const;

export const VERSION_MAJOR = {
  package: "0",
  lingui5: "5",
  lingui6: "6",
} as const;

export const VERSIONS = {
  packageManager: "pnpm@10.33.0",
  lingui: {
    [VERSION_MAJOR.lingui5]: {
      [PACKAGE.linguiBabelMacro]: "^5.0.0",
      [PACKAGE.linguiCli]: "^5.9.5",
      [PACKAGE.linguiConf]: "^5.9.5",
      [PACKAGE.linguiCore]: "^5.9.5",
    },
    [VERSION_MAJOR.lingui6]: {
      [PACKAGE.linguiBabelMacro]: "^6.0.0",
      [PACKAGE.linguiCli]: "^6.0.0",
      [PACKAGE.linguiConf]: "^6.0.0",
      [PACKAGE.linguiCore]: "^6.0.0",
    },
  },
  catalog: {
    [PACKAGE.typesNode]: "^25.6.0",
    [PACKAGE.typescript]: "^5.9.3",
  },
} as const;

export const PACKAGE_PATH = {
  [PACKAGE.frameworkCore]: "packages/framework-core",
  [PACKAGE.markupImport]: "packages/unplugin-markup-import",
  [PACKAGE.macro]: "packages/unplugin-lingui-macro",
  [PACKAGE.linguiAstro]: "packages/lingui-for-astro",
  [PACKAGE.linguiSvelte]: "packages/lingui-for-svelte",
} as const;

export const LOCAL_PACKAGES = [
  PACKAGE.frameworkCore,
  PACKAGE.markupImport,
  PACKAGE.macro,
  PACKAGE.linguiAstro,
  PACKAGE.linguiSvelte,
] as const;

export type LinguiMajor = keyof typeof VERSIONS.lingui;
export type LocalPackageName = (typeof LOCAL_PACKAGES)[number];
export type LocalTarballs = Record<LocalPackageName, string>;
