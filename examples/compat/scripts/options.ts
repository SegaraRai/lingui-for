import type { Options } from "./types.ts";

export const OPTION = {
  case: "--case",
  keep: "--keep",
  list: "--list",
  skipInstall: "--skip-install",
  tmpRoot: "--tmp-root",
  update: "--update",
  updateShort: "-u",
  separator: "--",
} as const;

export function parseArgs(args: string[]): Options {
  const options: Options = {
    names: [],
    list: false,
    keep: false,
    skipInstall: false,
    updateSnapshots: false,
    tmpRoot: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === OPTION.separator) {
      options.names.push(...args.slice(index + 1));
      break;
    } else if (arg === OPTION.list) {
      options.list = true;
    } else if (arg === OPTION.case) {
      const value = args[++index];
      if (!value) {
        throw new Error(`${OPTION.case} requires a case name.`);
      }
      options.names.push(value);
    } else if (arg.startsWith(`${OPTION.case}=`)) {
      options.names.push(arg.slice(`${OPTION.case}=`.length));
    } else if (arg === OPTION.keep) {
      options.keep = true;
    } else if (arg === OPTION.skipInstall) {
      options.skipInstall = true;
    } else if (arg === OPTION.update || arg === OPTION.updateShort) {
      options.updateSnapshots = true;
    } else if (arg === OPTION.tmpRoot) {
      const value = args[++index];
      if (!value) {
        throw new Error(`${OPTION.tmpRoot} requires a directory path.`);
      }
      options.tmpRoot = value;
    } else if (arg.startsWith(`${OPTION.tmpRoot}=`)) {
      options.tmpRoot = arg.slice(`${OPTION.tmpRoot}=`.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}
