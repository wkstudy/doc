# vite v1分支

## build
整体看下来就是就是一个执行rollup build的过程，包括生成rollup配置、调用一些特定插件等等，唯一多出来的就是需要处理下index.html,需要将该html的js、各种资源等提取出来，方便后续用rolluo进行处理


## dev
dev主要做了以下三件事
1. 启动了一个koa服务
2. 写了一堆koa插件用于处理各种文件的访问
3. 进行optimize
除此之外，印象比较深的还有关于路径的各种处理（比如 别名、public、node_modules...），以保证能提供正确得的返回


### hmr


## optimize(预构建)
主要使用rollup 对项目中的依赖（package.json里的dependencies）进行打包，放到`node_modules/.vite_opt_cache`下，打包过程是以各个dependency的入口文件为input，分别进行打包，当然每次预构建会根据packge.lock.json、package.json、vite.config.ts的内容生成一个hash值，用来判断下次optimize的时候需不需要重新进行打包





