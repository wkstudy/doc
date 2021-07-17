export * from "./config"; // WK 配置文件，所有vite.config.js相关的问题都可以来这里看看
export { createServer } from "./server"; // WK 启动一个server  一个websocket
export { build } from "./build"; //  WK build相关
export { optimizeDeps } from "./optimizer"; //  WK 优化
export { send } from "./server/send"; // WK dev server返回数据的方法
export { createLogger } from "./logger"; // WK 控制台上打印的各类信息
export { resolvePackageData, resolvePackageEntry } from "./plugins/resolve";
export { normalizePath } from "./utils";

// additional types
export type {
  ViteDevServer,
  ServerOptions,
  CorsOptions,
  FileSystemServeOptions,
  CorsOrigin,
  ServerHook,
  ResolvedServerOptions,
} from "./server";
export type {
  BuildOptions,
  LibraryOptions,
  LibraryFormats,
  ResolvedBuildOptions,
} from "./build";
export type {
  DepOptimizationMetadata,
  DepOptimizationOptions,
} from "./optimizer";
export type { Plugin } from "./plugin";
export type {
  Logger,
  LogOptions,
  LogLevel,
  LogType,
  LoggerOptions,
} from "./logger";
export type {
  AliasOptions,
  ResolverFunction,
  ResolverObject,
  Alias,
} from "types/alias";
export type {
  IndexHtmlTransform,
  IndexHtmlTransformHook,
  IndexHtmlTransformContext,
  IndexHtmlTransformResult,
  HtmlTagDescriptor,
} from "./plugins/html";
export type { CSSOptions, CSSModulesOptions } from "./plugins/css";
export type { JsonOptions } from "./plugins/json";
export type { ESBuildOptions, ESBuildTransformResult } from "./plugins/esbuild";
export type { Manifest, ManifestChunk } from "./plugins/manifest";
export type {
  PackageData,
  ResolveOptions,
  InternalResolveOptions,
} from "./plugins/resolve";
export type { WebSocketServer } from "./server/ws";
export type { PluginContainer } from "./server/pluginContainer";
export type { ModuleGraph, ModuleNode } from "./server/moduleGraph";
export type { ProxyOptions } from "./server/middlewares/proxy";
export type {
  TransformOptions,
  TransformResult,
} from "./server/transformRequest";
export type { HmrOptions, HmrContext } from "./server/hmr";
export type {
  HMRPayload,
  ConnectedPayload,
  UpdatePayload,
  Update,
  FullReloadPayload,
  CustomPayload,
  PrunePayload,
  ErrorPayload,
} from "types/hmrPayload";
export type { Connect } from "types/connect";
export type { HttpProxy } from "types/http-proxy";
export type { FSWatcher, WatchOptions } from "types/chokidar";
export type { Terser } from "types/terser";
export type { CleanCSS } from "types/clean-css";
export type { RollupCommonJSOptions } from "types/commonjs";
