## 组件化

Q: `new Vue(...,render: h => h(App))` 是怎么走到 render,再到 createElement 的？ 之前的是因为在 init 的时候只行了 mount，而这种写法并不会走 mount
A: 确实不会走 mount,实际上是 new Vue().$mount('#app')

## 深入响应式原理

WK Observer 里的 new Dep()和 defineReactive 里的 new Dep()各自是做什么的

#

> 它会先执行 vm.\_render() 方法，因为之前分析过这个方法会生成 渲染 VNode，并且在这个过程中会对 vm 上的数据访问，这个时候就触发了数据对象的 getter。

这里我知道应该是访问了，但不知掉具体是咋访问的

## record

1. 暂时没看 slot 和 transition transitoingroup 部分，主要是用的少，看起来有点费劲，后续有用到的时候再具体理解吧
