「本文已参与好文召集令活动，点击查看：[后端、大前端双赛道投稿，2 万元奖池等你挑战！](https://juejin.cn/post/6978685539985653767 "https://juejin.cn/post/6978685539985653767")」

## 简介

vite 一共有`dev | build | optimize | preview`四种命令，文章对 vite 整个流程做了梳理，对于`dev | build`的主要步骤做了简答的拆分，便于大家对 vite 源码形成一个整体的认识，有不对的地地方欢迎大家指正。

## 启动

vite 项目默认的两条命令`npm run serve` `npm run build`都是启动了 vite 命令，打开`/node_modules/.bin`目录,找到`vite`文件，发现其最主要的流程就是执行`start`函数，加载 node/cli 文件

```
// 此处源码如下
...
function start() {
  require('../dist/node/cli')
}
...
start()
...
```

然后到到 vite 源码的 cli 文件`vite/src/node/cli.ts`

## vite 脚手架`/src/node/cli.ts`

可以看出 vite 脚手架一共包括四个命令，`dev | build | optimize | preview` ，本文主要是梳理`dev | build`

```
dev 开发环境
build 构建
preview  vite预览
optimize 优化
```

## `vite dev`

### `cli.ts`

`cli.ts`中关于 dev 命令引用了`./server`的`createServer`,并触发`listen()`进行监听

![code.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/7f8ee35eb36840739f7ba2a43f9220fd~tplv-k3u1fbpfcp-watermark.image)

### `/node/server/index.ts`

`createServer`就是要创建并返回一个 server,具体的，做了以下几件事：

1. 整合配置文件 vite.config.js 和 命令行里的配置到 config 中

```
const config = await resolveConfig(inlineConfig, "serve", "development");
```

2. 启动一个 http(s)server,并升级为 websocket(当然前一步要先把 httpserver 的相关配置参数处理)

```
const httpsOptions = await resolveHttpsConfig(config);

  const middlewares = connect() as Connect.Server;
  const httpServer = middlewareMode
    ? null
    : await resolveHttpServer(serverConfig, middlewares, httpsOptions);
  const ws = createWebSocketServer(httpServer, config, httpsOptions);
```

3. 使用 chokidar 监听文件变化（这是进行热更新的基础）

```
const watcher = chokidar.watch(path.resolve(root), {
    ignored: ["**/node_modules/**", "**/.git/**", ...ignored],
    ignoreInitial: true,
    ignorePermissionErrors: true,
    disableGlobbing: true,
    ...watchOptions,
  }) as FSWatcher;
```

4. 将所有的 plugin 统一进行处理，保存到 container 中

```
const container = await createPluginContainer(config, watcher);
```

5. 根据 container 生成 moduleGraph（这里还没有细读，vite 中的解释是 moduleGraph 用于记录 import 的关系、url 到 file 的映射及热更新相关
   - and hmr state`）

```
const moduleGraph = new ModuleGraph(container);

// 下面是moduleGraph的ts定义
 /**
    * Module graph that tracks the import relationships, url to file mapping
    * and hmr state.
    */

```

6. 初始化后面要返回的 vite-dev-server,绑定了一些属性和方法

```
const server: ViteDevServer = {
...
}
```

7. watcher 发生变化的时候，进行相应的热更新处理

```
watcher.on('change', fn)
watcher.on('add', fn)
watcher.on('unlink', fn)
```

8. 执行 vite 钩子 `configureServer`,这里 postHooks 只收集有 configureServer 的 plugin

```
const postHooks: ((() => void) | void)[] = [];
  for (const plugin of plugins) {
    if (plugin.configureServer) {
      // WK 执行配置了configureServer的plugin
      postHooks.push(await plugin.configureServer(server));
    }
  }
```

9. 内部中间件的使用

```
...
middlewares.use(corsMiddleware(typeof cors === "boolean" ? {} : cors));

middlewares.use(proxyMiddleware(httpServer, config));
...

```

10. 执行 posHooks 里的 plugins

```
postHooks.forEach((fn) => fn && fn());
```

11. 转换 index.html

```
middlewares.use(indexHtmlMiddleware(server));
```

12. 在 listen()之前
    1. 执行 vite 钩子 buildStart
    2. 执行 runOptimize(),进行启动前的优化

```
if (!middlewareMode && httpServer) {
    // overwrite listen to run optimizer before server start
    const listen = httpServer.listen.bind(httpServer);
    httpServer.listen = (async (port: number, ...args: any[]) => {
      try {
        await container.buildStart({});
        await runOptimize();
      } catch (e) {
        httpServer.emit("error", e);
        return;
      }
      return listen(port, ...args);
    }) as any;

    httpServer.once("listening", () => {
      // update actual port since this may be different from initial value
      serverConfig.port = (httpServer.address() as AddressInfo).port;
    });
  } else {
    await container.buildStart({});
    await runOptimize();
  }

```

13. 返回 server

## `vite build`

### `cli.ts`

`build`命令就是引入了`./build`文件,并执行`build()`

![code.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/758d3fcda0d746ffb2b768ac47b2e2a8~tplv-k3u1fbpfcp-watermark.image)

### rollup 打包

vite 使用 rollup 进行打包的，在阅读相关方法之前，有必要对 rollup 进行一些基本了解。以下是 rollup 官网对其打包过程的代码描述。[rollup javascript API](https://www.rollupjs.com/guide/javascript-api)
![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/c0d043726b81452394344e82e9857e1d~tplv-k3u1fbpfcp-watermark.image)

可以看出 rollup 一般的打包需要

1. 打包的配置参数`inputOptions`
2. 打包生成文件的配置参数 `outputOptions`
3. 调用`rollup.rollup()`返回一个 bundle 对象
4. 调用`bundle.generate()` 或者`bundle.write()` 完成打包
   那么 vite 的 build 也应该是按照这个流程来的

### `build.ts`

`build.ts`中`build`方法主要是指行了`dobuild`方法，`dobuild`做了以下几件事(ssr 相关的先不考虑)：

1. 整理配置参数=> config

```
const config = await resolveConfig(inlineConfig, "build", "production");
```

2. rollup 打包输入参数=> RollupOptions,在此之前处理了一下对于 RollupOptions 对象比较重要的 input 参数和 external

```
const RollupOptions: RollupOptions = {
    input,
    preserveEntrySignatures: ssr
      ? "allow-extension"
      : libOptions
      ? "strict"
      : false,
    ...options.rollupOptions,
    plugins,
    external,
    onwarn(warning, warn) {
      onRollupWarning(warning, warn, config);
    },
  };
```

3.  rollup 打包输出参数 outputs(一般我们在项目开发中 outputs 就是个 obj,但在构建库时可能需要生成不同格式的包，所以 outputs 也可能是个数组)

```
const outputs = resolveBuildOutputs(
  options.rollupOptions?.output,
  libOptions,
  config.logger
);
```

4. rollup 还提供了一个 watch 功能，vite 这里也进行相应的实现[直达 rollup-watch](https://www.rollupjs.com/guide/javascript-api#rollupwatch)

```
if (config.build.watch) {
  config.logger.info(chalk.cyanBright(`\nwatching for file changes...`));

  const output: OutputOptions[] = [];
  if (Array.isArray(outputs)) {
    for (const resolvedOutput of outputs) {
      output.push(buildOuputOptions(resolvedOutput));
    }
  } else {
    output.push(buildOuputOptions(outputs));
  }

  const watcherOptions = config.build.watch;
  const watcher = rollup.watch({
    ...rollupOptions,
    output,
    watch: {
      ...watcherOptions,
      chokidar: {
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          ...(watcherOptions?.chokidar?.ignored || []),
        ],
        ignoreInitial: true,
        ignorePermissionErrors: true,
        ...watcherOptions.chokidar,
      },
    },
  });

  watcher.on("event", (event) => {
    if (event.code === "BUNDLE_START") {
      config.logger.info(chalk.cyanBright(`\nbuild started...`));
      if (options.write) {
        prepareOutDir(outDir, options.emptyOutDir, config);
      }
    } else if (event.code === "BUNDLE_END") {
      event.result.close();
      config.logger.info(chalk.cyanBright(`built in ${event.duration}ms.`));
    } else if (event.code === "ERROR") {
      outputBuildError(event.error);
    }
  });

  // stop watching
  watcher.close();

  return watcher;
}

```

5. 生成 bundle 对象

```
const bundle = await rollup.rollup(rollupOptions);
```

6. 调用 bundle.write 方法，写到文件中，大功告成。在这之前还调用`prepareOutDir`方法（确认了打包目录是否存在及清理了该目录）

```
if (options.write) {
  prepareOutDir(outDir, options.emptyOutDir, config);
}

if (Array.isArray(outputs)) {
  const res = [];
  for (const output of outputs) {
    res.push(await generate(output));
  }
  return res;
} else {
  return await generate(outputs);
}
```

## 后续计划

精读 vite，看一些细节部分的实现，如对`import { createApp } from 'vue'`的处理

## 其他

本次阅读相关的注释在[](),可以通过 vscode 插件 todo tree, 前缀'WK'的都是我看的过程中加的注释

![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/cd3c502d569147d9bde6a95c338460a2~tplv-k3u1fbpfcp-watermark.image)
