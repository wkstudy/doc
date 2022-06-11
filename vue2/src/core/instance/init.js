/* @flow */

import config from "../config";
import { initProxy } from "./proxy";
import { initState } from "./state";
import { initRender } from "./render";
import { initEvents } from "./events";
import { mark, measure } from "../util/perf";
import { initLifecycle, callHook } from "./lifecycle";
import { initProvide, initInjections } from "./inject";
import { extend, mergeOptions, formatComponentName } from "../util/index";

let uid = 0;
// WK 1. vm.$options 初始化（props inject mixin directives...）
// WK 2. (非production)初始化proxy
// WK 3. 注入生命周期、事件...并触发生命周期 beforecreate  created
// WK 4. vm.$mount()

export function initMixin(Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    debugger;
    const vm: Component = this;
    // a uid
    vm._uid = uid++;

    let startTag, endTag;
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`;
      endTag = `vue-perf-end:${vm._uid}`;
      mark(startTag);
    }

    // a flag to avoid this being observed
    vm._isVue = true;
    // merge options
    // WK 初始化 vm.$options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options);
    } else {
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      );
    }
    /* istanbul ignore else */
    // WK 初始化vm._renderProxy
    //  _renderProxy的作用是 当用户访问this.a时，如果a不存在就报错
    // 还有一种特殊情况：当用户自定义的变量是 `_` 或`$`开头的话，提醒用户无法直接通过vm._a访问，而要通过vm.$data._a访问
    if (process.env.NODE_ENV !== "production") {
      initProxy(vm);
    } else {
      vm._renderProxy = vm;
    }
    // expose real self
    vm._self = vm;
    initLifecycle(vm);
    // WK 初始化_evnets 、 $listeners属性
    initEvents(vm);
    // WK 初始化 _vnode $slots 属性，绑定_c() 、createelement()方法， 初始化$attrs $listeners属性、方法
    initRender(vm);
    callHook(vm, "beforeCreate");
    // WK 初始化inject
    initInjections(vm); // resolve injections before data/props
    // WK 初始化 props methods  data computed watcher
    initState(vm);
    // WK provide挂载到vm._provided
    initProvide(vm); // resolve provide after data/props
    callHook(vm, "created");

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      vm._name = formatComponentName(vm, false);
      mark(endTag);
      measure(`vue ${vm._name} init`, startTag, endTag);
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el);
    }
  };
}

export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  // WK 注意这里的opts的改变也对应到了vm.$options的改变,为啥还要opts呢，直接用vm.$options不行吗?
  //  应该就是个简写（属于一个少写代码的小技巧）
  const opts = (vm.$options = Object.create(vm.constructor.options));
  // doing this because it's faster than dynamic enumeration.
  // WK 翻译一下上面的这行话（按照我的理解）
  // 如果不是组件的话，即` options._isComponent = false`，会走else的逻辑，而else里的options会枚举parent child所有的属性进行合并，得到最后的options
  // 这里属于一个优化，直接采用下面的方法就完成了otions的赋值
  const parentVnode = options._parentVnode;
  opts.parent = options.parent;
  opts._parentVnode = parentVnode;

  const vnodeComponentOptions = parentVnode.componentOptions;
  opts.propsData = vnodeComponentOptions.propsData;
  opts._parentListeners = vnodeComponentOptions.listeners;
  opts._renderChildren = vnodeComponentOptions.children;
  opts._componentTag = vnodeComponentOptions.tag;

  if (options.render) {
    opts.render = options.render;
    opts.staticRenderFns = options.staticRenderFns;
  }
}

// WK 返回options
export function resolveConstructorOptions(Ctor: Class<Component>) {
  let options = Ctor.options;
  if (Ctor.super) {
    // WK  当Ctor组件是继承自xx组件时，需要关注xx组件的options是否变了，变了的话就需要同步修改Ctor的options
    //  组件的option里包含各种信息，具体可以看global-api/index.js的操作，（props、comuted、mounted、extends、mixins...）
    const superOptions = resolveConstructorOptions(Ctor.super);
    const cachedSuperOptions = Ctor.superOptions;
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions;
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor);
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions);
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) {
        options.components[options.name] = Ctor;
      }
    }
  }
  return options;
}

function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified;
  const latest = Ctor.options;
  const sealed = Ctor.sealedOptions;
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {};
      modified[key] = latest[key];
    }
  }
  return modified;
}
