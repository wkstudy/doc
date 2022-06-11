import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";
import { warn } from "../util/index";

function Vue(options) {
  debugger;
  if (process.env.NODE_ENV !== "production" && !(this instanceof Vue)) {
    warn("Vue is a constructor and should be called with the `new` keyword");
  }
  this._init(options);
}
// WK vue上挂载了一个_init方法
initMixin(Vue);
// WK 挂载并暴露$data $props  $set  $del $watch方法
stateMixin(Vue);
// WK 挂载并暴露$on #once $off $emit
eventsMixin(Vue);
// WK 挂载并暴露_update  $forceupdate    $destory
lifecycleMixin(Vue);
// WK 挂载并暴露$nextTick _render,注册一些函数以供编译ast时使用
renderMixin(Vue);

export default Vue;
