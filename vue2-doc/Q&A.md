## 组件化

Q: `new Vue(...,render: h => h(App))` 是怎么走到 render,再到 createElement 的？ 之前的是因为在 init 的时候只行了 mount，而这种写法并不会走 mount
A: 确实不会走 mount,实际上是 new Vue().$mount('#app')

## 深入响应式原理

WK Observer 里的 new Dep()和 defineReactive 里的 new Dep()各自是做什么的

#

> 它会先执行 vm.\_render() 方法，因为之前分析过这个方法会生成 渲染 VNode，并且在这个过程中会对 vm 上的数据访问，这个时候就触发了数据对象的 getter。

这里我知道应该是访问了，但不知掉具体是咋访问的

compiler 的 parse optimize generate 先不看

## /Users/kaiwang/test/doc/vue/src/core/vdom/helpers/normalize-children.js

这个文件里的处理不是很明白

## `vue/src/platforms/web/entry-runtime-with-compiler.js`里定义了了`Vue.prototype.$mount`,但我发现在`/vue/src/platforms/web/runtime/index.js`也定义了`Vue.prototype.$mount` ，为什么要重复定义呢？

## vnode = render.call(vm.\_renderProxy, vm.$createElement);这里传了一个vm.$createElement, 想知道是怎么调用的

##

vnode.parent 是啥
parent placeholder node element 是啥东西？

##

patch 里只看了最简单的情况，即 new Vue(),没有涉及新旧两个 vnode 更新，也没涉及有 parent node 的情况
