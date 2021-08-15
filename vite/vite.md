## knowledge

1. `inspector` (是用来做 nodejs 调试的 https://www.nodeapp.cn/inspector.html https://blog.csdn.net/sd19871122/article/details/80746337)

2. package.json 中的 type 字段的含义及使用

[type 含义](https://www.cnblogs.com/zmztya/p/14419578.html)

3. `connect`

一个 nodejs 的 http 服务框架，可看作是 express、koa（https://juejin.cn/post/6956530149453987870）

```

import connect from 'connect'

```

4. `ws`
   可用作 external http/s server (https://www.npmjs.com/package/ws)

```
import WebSocket from 'ws'
```

5. `chokidar`
   跨平台的文件监听库
   (https://www.npmjs.com/package/chokidar)

6. `cac` Command And Conquer is a Javascript library for building CLI apps

7. `es-module-lexer`
类似与babel, 做词法分析，可以参考[Es-Module-Lexer，ES Module 语法的词法分析利器](https://blog.csdn.net/qq_42049445/article/details/115654324)的介绍

8. `magic-string`
对源代码做一些轻量的修改，并生成sourcemap,（我理解有点类似与babel的generate）

9. `fast-glob`
遍历文件系统， 返回符合格式的文件数组