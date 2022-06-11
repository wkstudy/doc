/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace,
} from "../util/index";

import modules from "./modules/index";
import directives from "./directives/index";
import { genStaticKeys } from "shared/util";
import { isUnaryTag, canBeLeftOpenTag } from "./util";

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  directives,
  isPreTag, // function (tag) { return tag === 'pre'; }  源码就是这个，找的话太麻烦了
  isUnaryTag, // 一元标签
  mustUseProp,
  canBeLeftOpenTag,
  isReservedTag,
  getTagNamespace,
  staticKeys: genStaticKeys(modules),
};
