/* @flow */

import { toArray } from "../util/index";
// WK use api
export function initUse(Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // _installedPlugins 保证插件不会重复安装
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []);
    if (installedPlugins.indexOf(plugin) > -1) {
      return this;
    }

    // additional parameters
    const args = toArray(arguments, 1);
    args.unshift(this);
    if (typeof plugin.install === "function") {
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === "function") {
      plugin.apply(null, args);
    }
    installedPlugins.push(plugin);
    return this;
  };
}
