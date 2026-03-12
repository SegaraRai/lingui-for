declare module "@farmfe/core" {
  export type CompilationContext = unknown;
  export type JsPlugin = unknown;
}

declare module "@rspack/core" {
  export type Compilation = unknown;
  export type Compiler = unknown;
  export type LoaderContext<T = unknown> = T;
  export type RspackPluginInstance = unknown;
}

declare module "bun" {
  export type BunPlugin = unknown;
  export type PluginBuilder = unknown;
}

declare module "rolldown" {
  export type Plugin = unknown;
}

declare module "unloader" {
  export type Plugin = unknown;
}

declare module "webpack" {
  export type Compilation = unknown;
  export type Compiler = unknown;
  export type LoaderContext<T = unknown> = T;
  export type WebpackPluginInstance = unknown;
}
