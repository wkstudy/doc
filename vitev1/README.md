# vite v1分支

## build
整体看下来就是就是一个执行rollup build的过程，包括生成rollup配置、调用一些特定插件等等，唯一多出来的就是需要处理下index.html,需要将该html的js、各种资源等提取出来，方便后续用rolluo进行处理


