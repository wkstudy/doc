# vite

## package.json

```
"bin": {
    "vite": "bin/vite.js"
  },
  "main": "dist/node/index.js",
```

入口文件在 `bin/vite.js`

## `bin/vite.js`

这里有一些 vite 相关处理， 主要是一个`start`函数

```

function start() {
  require('../dist/node/cli')
}
```

## dist

[图片](./dist.png)

## /node/cli

## knowledge

1. `inspector` (是用来做 nodejs 调试的 https://www.nodeapp.cn/inspector.html https://blog.csdn.net/sd19871122/article/details/80746337)

## Q: package.json 中的 type 字段的含义及使用

1. [type 含义](https://www.cnblogs.com/zmztya/p/14419578.html)

## Q&A

1. `connect`是干嘛的

一个 nodejs 的 http 服务框架，可看作是 express、koa（https://juejin.cn/post/6956530149453987870）

```

import connect from 'connect'

```

2. `ws`是干嘛的
   可用作 external http/s server (https://www.npmjs.com/package/ws)

```
import WebSocket from 'ws'
```

3. `chokidar`是干嘛的
   跨平台的文件监听库
   (https://www.npmjs.com/package/chokidar)

1. `cac ???` Command And Conquer is a Javascript library for building CLI apps
