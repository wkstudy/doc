import { parse } from "acorn/src/index.js";
import MagicString from "magic-string";
import { walk } from "estree-walker";
import Statement from "./Statement.js";
import { assign, blank, keys } from "./utils/object.js";
import { basename, extname } from "./utils/path.js";
import getLocation from "./utils/getLocation.js";
import makeLegalIdentifier from "./utils/makeLegalIdentifier.js";
import SOURCEMAPPING_URL from "./utils/sourceMappingURL.js";
import {
  SyntheticDefaultDeclaration,
  SyntheticGlobalDeclaration,
  SyntheticNamespaceDeclaration,
} from "./Declaration.js";
import { isFalsy, isTruthy } from "./ast/conditions.js";
import { emptyBlockStatement } from "./ast/create.js";
import extractNames from "./ast/extractNames.js";

export default class Module {
  constructor({ id, code, originalCode, originalSourceMap, ast, sourceMapChain, resolvedIds, bundle }) {
    this.code = code;
    this.originalCode = originalCode;
    this.originalSourceMap = originalSourceMap;
    this.sourceMapChain = sourceMapChain;

    this.bundle = bundle;
    this.id = id;
    this.excludeFromSourcemap = /\0/.test(id);

    // all dependencies
    this.sources = []; // wk 存的都是import export语句的路径eg import a from './lib/a.js' export {b} from './lib/b.js' ['./lib/a.js', './lib/b.js']
    this.dependencies = []; // wk 存每个sources对应的module
    this.resolvedIds = resolvedIds || blank();

    // imports and exports, indexed by local name
    this.imports = blank();
    this.exports = blank();
    this.exportsAll = blank();
    this.reexports = blank();

    this.exportAllSources = []; // wk `export * from './lib/a.js'` 这种的路径 ['./lib/a.js']
    this.exportAllModules = null;

    // By default, `id` is the filename. Custom resolvers and loaders
    // can change that, but it makes sense to use it for the source filename
    this.magicString = new MagicString(code, {
      filename: this.excludeFromSourcemap ? null : id, // don't include plugin helpers in sourcemap
      indentExclusionRanges: [],
    });

    // remove existing sourceMappingURL comments
    const pattern = new RegExp(`\\/\\/#\\s+${SOURCEMAPPING_URL}=.+\\n?`, "g");
    let match;
    while ((match = pattern.exec(code))) {
      this.magicString.remove(match.index, match.index + match[0].length);
    }

    this.comments = [];
    this.ast = ast;
    // wk ast解析
    this.statements = this.parse();

    this.declarations = blank(); // wk 该模块存的声明的变量
    this.analyse();

    this.strongDependencies = [];
  }

  addExport(statement) {
    const node = statement.node;
    const source = node.source && node.source.value;

    // export { name } from './other.js'
    if (source) {
      if (!~this.sources.indexOf(source)) this.sources.push(source);

      if (node.type === "ExportAllDeclaration") {
        // Store `export * from '...'` statements in an array of delegates.
        // When an unknown import is encountered, we see if one of them can satisfy it.
        this.exportAllSources.push(source);
      } else {
        node.specifiers.forEach((specifier) => {
          const name = specifier.exported.name;

          if (this.exports[name] || this.reexports[name]) {
            throw new Error(`A module cannot have multiple exports with the same name ('${name}')`);
          }

          this.reexports[name] = {
            start: specifier.start,
            source,
            localName: specifier.local.name,
            module: null, // filled in later
          };
        });
      }
    }

    // export default function foo () {}
    // export default foo;
    // export default 42;
    else if (node.type === "ExportDefaultDeclaration") {
      const identifier = (node.declaration.id && node.declaration.id.name) || node.declaration.name;

      if (this.exports.default) {
        // TODO indicate location
        throw new Error("A module can only have one default export");
      }

      this.exports.default = {
        localName: "default",
        identifier,
      };

      // create a synthetic declaration
      // wk 记录模块export的变量
      this.declarations.default = new SyntheticDefaultDeclaration(node, statement, identifier || this.basename());
    }

    // export var { foo, bar } = ...
    // export var foo = 42;
    // export var a = 1, b = 2, c = 3;
    // export function foo () {}
    else if (node.declaration) {
      const declaration = node.declaration;

      if (declaration.type === "VariableDeclaration") {
        declaration.declarations.forEach((decl) => {
          extractNames(decl.id).forEach((localName) => {
            this.exports[localName] = { localName };
          });
        });
      } else {
        // export function foo () {}
        const localName = declaration.id.name;
        this.exports[localName] = { localName };
      }
    }

    // export { foo, bar, baz }
    else {
      if (node.specifiers.length) {
        node.specifiers.forEach((specifier) => {
          const localName = specifier.local.name;
          const exportedName = specifier.exported.name;

          if (this.exports[exportedName] || this.reexports[exportedName]) {
            throw new Error(`A module cannot have multiple exports with the same name ('${exportedName}')`);
          }

          this.exports[exportedName] = { localName };
        });
      } else {
        this.bundle.onwarn(`Module ${this.id} has an empty export declaration`);
      }
    }
  }

  addImport(statement) {
    const node = statement.node;
    const source = node.source.value;

    if (!~this.sources.indexOf(source)) this.sources.push(source);

    node.specifiers.forEach((specifier) => {
      const localName = specifier.local.name;

      if (this.imports[localName]) {
        const err = new Error(`Duplicated import '${localName}'`);
        err.file = this.id;
        err.loc = getLocation(this.code, specifier.start);
        throw err;
      }

      const isDefault = specifier.type === "ImportDefaultSpecifier";
      const isNamespace = specifier.type === "ImportNamespaceSpecifier";

      const name = isDefault ? "default" : isNamespace ? "*" : specifier.imported.name;
      // wk 此时只是初始化this.imports[localName],具体内容（来自哪个module）有待后续解决
      this.imports[localName] = { source, name, module: null };
    });
  }

  analyse() {
    // discover this module's imports and exports
    this.statements.forEach((statement) => {
      // wk import  export 语句单独记录 
      if (statement.isImportDeclaration) this.addImport(statement);
      else if (statement.isExportDeclaration) this.addExport(statement);
      // wk 重要  找reference ,便于后续 bindAlias 和 bindReference
      statement.firstPass();

      // wk 这条statement里如果也是变量声明的话就记录下来
      // eg const a = b + c;  就记一个this.declarations[c] = 这条语句
      statement.scope.eachDeclaration((name, declaration) => {
        this.declarations[name] = declaration;
      });
    });
  }

  basename() {
    const base = basename(this.id);
    const ext = extname(this.id);

    return makeLegalIdentifier(ext ? base.slice(0, -ext.length) : base);
  }

  // wk 这里我理解是有引用关系的两个语句会记录其依赖关系，通过declaration的alias来记录   ———— 语句级别之间的关系（这里只处理变量（存在declarations里）引用之间的关系）
  bindAliases() {
    // wk declarations记录的是模块中的所有变量
    keys(this.declarations).forEach((name) => {
      if (name === "*") return;

      const declaration = this.declarations[name];
      // statement是变量定义的那条语句
      const statement = declaration.statement;

      if (!statement || statement.node.type !== "VariableDeclaration") return;

      const init = statement.node.declarations[0].init;
      if (!init || init.type === "FunctionExpression") return;

      // wk 关于references
      // eg: let a = 2; 这条declaration里的references会记录一条数据，就是其本身
      // let a = b + c,这条declaration里的references会有三条['本身'，'b', 'c'],
      //   下面的运行结果就是分别找到b 和c 变量声明的declaration(暂且记为declarationB declarationC)，
      //    记录a的declaration（暂且记为declarationA）和这两个之间的联系
      // declarationB['aliases'] = [decalarationA]
      // declarationC['aliases'] = [decalarationA]

      statement.references.forEach((reference) => {
        if (reference.name === name) return;

        const otherDeclaration = this.trace(reference.name);
        if (otherDeclaration) otherDeclaration.addAlias(declaration);
      });
    });
  }

  // wk 模块之间的依赖关系确立 ，用的是dependencies记录  ————module级别之间的关系
  bindImportSpecifiers() {
    [this.imports, this.reexports].forEach((specifiers) => {
      keys(specifiers).forEach((name) => {
        const specifier = specifiers[name];

        /**
         *  wk 完善this.imports reexports的内容，将该module对应的id补齐
         *  eg: addImport()时的结果是
         *  `this.imports[localName] = { source, name, module: null };`
         * 此时缺少module信息信息，只知道有这个import
         */
        const id = this.resolvedIds[specifier.source];
        specifier.module = this.bundle.moduleById.get(id);
      });
    });

    this.exportAllModules = this.exportAllSources.map((source) => {
      const id = this.resolvedIds[source];
      return this.bundle.moduleById.get(id);
    });

    this.sources.forEach((source) => {
      const id = this.resolvedIds[source];
      const module = this.bundle.moduleById.get(id);
      // wk 把依赖的module记录下来，放到dependencies里
      if (!module.isExternal) this.dependencies.push(module);
    });
  }

  // wk 应该是 确定当前module的每个变量是从哪个ast拿来的，并利用references下来, ———— 两个变量级别之间的关系
  // wk eg  a.js中有 getName()，就找到getName()是从b.js里定义的，把这两处的代码关联起来
  bindReferences() {
    if (this.declarations.default) {
      if (this.exports.default.identifier) {
        const declaration = this.trace(this.exports.default.identifier);
        if (declaration) this.declarations.default.bind(declaration);
      }
    }

    this.statements.forEach((statement) => {
      // skip `export { foo, bar, baz }`...
      if (statement.node.type === "ExportNamedDeclaration" && statement.node.specifiers.length) {
        // ...unless this is the entry module
        if (this !== this.bundle.entryModule) return;
      }

      statement.references.forEach((reference) => {
        const declaration = reference.scope.findDeclaration(reference.name) || this.trace(reference.name);

        if (declaration) {
          declaration.addReference(reference);
        } else {
          // TODO handle globals
          this.bundle.assumedGlobals[reference.name] = true;
        }
      });
    });
  }

  // wk 只取export 不管import
  getExports() {
    const exports = blank();

    keys(this.exports).forEach((name) => {
      exports[name] = true;
    });

    keys(this.reexports).forEach((name) => {
      exports[name] = true;
    });

    this.exportAllModules.forEach((module) => {
      module.getExports().forEach((name) => {
        if (name !== "default") exports[name] = true;
      });
    });

    return keys(exports);
  }

  namespace() {
    if (!this.declarations["*"]) {
      this.declarations["*"] = new SyntheticNamespaceDeclaration(this);
    }

    return this.declarations["*"];
  }

  parse() {
    // The ast can be supplied programmatically (but usually won't be)
    if (!this.ast) {
      // Try to extract a list of top-level statements/declarations. If
      // the parse fails, attach file info and abort
      // wk 这里记录的是模块top-level最外层的declaration（变量声明）和statements(语句)
      try {
        this.ast = parse(
          this.code,
          assign(
            {
              ecmaVersion: 6,
              sourceType: "module",
              onComment: (block, text, start, end) => this.comments.push({ block, text, start, end }),
              preserveParens: true,
            },
            this.bundle.acornOptions
          )
        );
      } catch (err) {
        err.code = "PARSE_ERROR";
        err.file = this.id; // see above - not necessarily true, but true enough
        err.message += ` in ${this.id}`;
        throw err;
      }
    }

    walk(this.ast, {
      enter: (node) => {
        // wk 此处是在ast解析的过程中就完成了
        // eliminate dead branches early
        if (node.type === "IfStatement") {
          // wk 进行treeshaking 场景： if(false) {}
          if (isFalsy(node.test)) {
            this.magicString.overwrite(node.consequent.start, node.consequent.end, "{}");
            node.consequent = emptyBlockStatement(node.consequent.start, node.consequent.end);
          } else if (node.alternate && isTruthy(node.test)) {
            this.magicString.overwrite(node.alternate.start, node.alternate.end, "{}");
            node.alternate = emptyBlockStatement(node.alternate.start, node.alternate.end);
          }
        }

        this.magicString.addSourcemapLocation(node.start);
        this.magicString.addSourcemapLocation(node.end);
      },

      leave: (node, parent, prop) => {
        // eliminate dead branches early
        if (node.type === "ConditionalExpression") {
          if (isFalsy(node.test)) {
            this.magicString.remove(node.start, node.alternate.start);
            parent[prop] = node.alternate;
          } else if (isTruthy(node.test)) {
            this.magicString.remove(node.start, node.consequent.start);
            this.magicString.remove(node.consequent.end, node.end);
            parent[prop] = node.consequent;
          }
        }
      },
    });

    const statements = []; // wk 收集所有的节点，包括一些特殊处理的（eg ExportNamedDeclaration、VariableDeclaration
    let lastChar = 0;
    let commentIndex = 0;

    this.ast.body.forEach((node) => {
      if (node.type === "EmptyStatement") return;

      // wk 收集export的变量
      if (
        node.type === "ExportNamedDeclaration" &&
        node.declaration &&
        node.declaration.type === "VariableDeclaration" &&
        node.declaration.declarations &&
        node.declaration.declarations.length > 1
      ) {
        // push a synthetic export declaration
        const syntheticNode = {
          type: "ExportNamedDeclaration",
          specifiers: node.declaration.declarations.map((declarator) => {
            const id = { name: declarator.id.name };
            return {
              local: id,
              exported: id,
            };
          }),
          isSynthetic: true,
        };

        const statement = new Statement(syntheticNode, this, node.start, node.start);
        statements.push(statement);

        this.magicString.remove(node.start, node.declaration.start);
        node = node.declaration;
      }

      // special case - top-level var declarations with multiple declarators
      // should be split up. Otherwise, we may end up including code we
      // don't need, just because an unwanted declarator is included
      if (node.type === "VariableDeclaration" && node.declarations.length > 1) {
        // remove the leading var/let/const... UNLESS the previous node
        // was also a synthetic node, in which case it'll get removed anyway
        const lastStatement = statements[statements.length - 1];
        if (!lastStatement || !lastStatement.node.isSynthetic) {
          this.magicString.remove(node.start, node.declarations[0].start);
        }

        node.declarations.forEach((declarator) => {
          const { start, end } = declarator;

          const syntheticNode = {
            type: "VariableDeclaration",
            kind: node.kind,
            start,
            end,
            declarations: [declarator],
            isSynthetic: true,
          };

          const statement = new Statement(syntheticNode, this, start, end);
          statements.push(statement);
        });

        lastChar = node.end; // TODO account for trailing line comment
      } else {
        let comment;
        do {
          comment = this.comments[commentIndex];
          if (!comment) break;
          if (comment.start > node.start) break;
          commentIndex += 1;
        } while (comment.end < lastChar);

        const start = comment ? Math.min(comment.start, node.start) : node.start;
        const end = node.end; // TODO account for trailing line comment

        const statement = new Statement(node, this, start, end);
        statements.push(statement);

        lastChar = end;
      }
    });

    let i = statements.length;
    let next = this.code.length;
    while (i--) {
      statements[i].next = next;
      if (!statements[i].isSynthetic) next = statements[i].start;
    }

    return statements;
  }

  render(es) {
    const magicString = this.magicString;

    this.statements.forEach((statement) => {
      // wk 使用statement.isIncluded去掉无效代码
      if (!statement.isIncluded) {
        if (statement.node.type === "ImportDeclaration") {
          magicString.remove(statement.node.start, statement.next);
          return;
        }

        magicString.remove(statement.start, statement.next);
        return;
      }

      statement.stringLiteralRanges.forEach((range) => magicString.indentExclusionRanges.push(range));

      // skip `export { foo, bar, baz }`
      if (statement.node.type === "ExportNamedDeclaration") {
        if (statement.node.isSynthetic) return;

        // skip `export { foo, bar, baz }`
        if (statement.node.declaration === null) {
          magicString.remove(statement.start, statement.next);
          return;
        }
      }

      // split up/remove var declarations as necessary
      if (statement.node.type === "VariableDeclaration") {
        const declarator = statement.node.declarations[0];

        if (declarator.id.type === "Identifier") {
          const declaration = this.declarations[declarator.id.name];

          if (declaration.exportName && declaration.isReassigned) {
            // `var foo = ...` becomes `exports.foo = ...`
            magicString.remove(statement.start, declarator.init ? declarator.start : statement.next);
            if (!declarator.init) return;
          }
        } else {
          // we handle destructuring differently, because whereas we can rewrite
          // `var foo = ...` as `exports.foo = ...`, in a case like `var { a, b } = c()`
          // where `a` or `b` is exported and reassigned, we have to append
          // `exports.a = a;` and `exports.b = b` instead
          extractNames(declarator.id).forEach((name) => {
            const declaration = this.declarations[name];

            if (declaration.exportName && declaration.isReassigned) {
              magicString.insertLeft(statement.end, `;\nexports.${name} = ${declaration.render(es)}`);
            }
          });
        }

        if (statement.node.isSynthetic) {
          // insert `var/let/const` if necessary
          magicString.insertRight(statement.start, `${statement.node.kind} `);
          magicString.insertLeft(statement.end, ";");
          magicString.overwrite(statement.end, statement.next, "\n"); // TODO account for trailing newlines
        }
      }

      const toDeshadow = blank();

      statement.references.forEach((reference) => {
        const { start, end } = reference;

        if (reference.isUndefined) {
          magicString.overwrite(start, end, "undefined", true);
        }

        const declaration = reference.declaration;

        if (declaration) {
          const name = declaration.render(es);

          // the second part of this check is necessary because of
          // namespace optimisation – name of `foo.bar` could be `bar`
          if (reference.name === name && name.length === end - start) return;

          reference.rewritten = true;

          // prevent local variables from shadowing renamed references
          const identifier = name.match(/[^\.]+/)[0];
          if (reference.scope.contains(identifier)) {
            toDeshadow[identifier] = `${identifier}$$`; // TODO more robust mechanism
          }

          if (reference.isShorthandProperty) {
            magicString.insertLeft(end, `: ${name}`);
          } else {
            magicString.overwrite(start, end, name, true);
          }
        }
      });

      if (keys(toDeshadow).length) {
        statement.references.forEach((reference) => {
          if (!reference.rewritten && reference.name in toDeshadow) {
            const replacement = toDeshadow[reference.name];
            magicString.overwrite(
              reference.start,
              reference.end,
              reference.isShorthandProperty ? `${reference.name}: ${replacement}` : replacement,
              true
            );
          }
        });
      }

      // modify exports as necessary
      if (statement.isExportDeclaration) {
        // remove `export` from `export var foo = 42`
        // TODO: can we do something simpler here?
        // we just want to remove `export`, right?
        if (
          statement.node.type === "ExportNamedDeclaration" &&
          statement.node.declaration.type === "VariableDeclaration"
        ) {
          const name = extractNames(statement.node.declaration.declarations[0].id)[0];
          const declaration = this.declarations[name];

          // TODO is this even possible?
          if (!declaration) throw new Error(`Missing declaration for ${name}!`);

          let end;

          if (es) {
            end = statement.node.declaration.start;
          } else {
            if (declaration.exportName && declaration.isReassigned) {
              const declarator = statement.node.declaration.declarations[0];
              end = declarator.init ? declarator.start : statement.next;
            } else {
              end = statement.node.declaration.start;
            }
          }

          magicString.remove(statement.node.start, end);
        } else if (statement.node.type === "ExportAllDeclaration") {
          // TODO: remove once `export * from 'external'` is supported.
          magicString.remove(statement.start, statement.next);
        }

        // remove `export` from `export class Foo {...}` or `export default Foo`
        // TODO default exports need different treatment
        else if (statement.node.declaration.id) {
          magicString.remove(statement.node.start, statement.node.declaration.start);
        } else if (statement.node.type === "ExportDefaultDeclaration") {
          const defaultDeclaration = this.declarations.default;

          // prevent `var foo = foo`
          if (defaultDeclaration.original && !defaultDeclaration.original.isReassigned) {
            magicString.remove(statement.start, statement.next);
            return;
          }

          const defaultName = defaultDeclaration.render();

          // prevent `var undefined = sideEffectyDefault(foo)`
          // wk 使用到declaration.isUsed 去除无用代码
          if (!defaultDeclaration.exportName && !defaultDeclaration.isUsed) {
            magicString.remove(statement.start, statement.node.declaration.start);
            return;
          }

          // anonymous functions should be converted into declarations
          if (statement.node.declaration.type === "FunctionExpression") {
            magicString.overwrite(
              statement.node.start,
              statement.node.declaration.start + 8,
              `function ${defaultName}`
            );
          } else {
            magicString.overwrite(
              statement.node.start,
              statement.node.declaration.start,
              `${this.bundle.varOrConst} ${defaultName} = `
            );
          }
        } else {
          throw new Error("Unhandled export");
        }
      }
    });

    // add namespace block if necessary
    const namespace = this.declarations["*"];
    if (namespace && namespace.needsNamespaceBlock) {
      magicString.append("\n\n" + namespace.renderBlock(magicString.getIndentString()));
    }

    return magicString.trim();
  }

  /**
   * Statically runs the module marking the top-level statements that must be
   * included for the module to execute successfully.
   *
   * @param {boolean} treeshake - if we should tree-shake the module
   * @return {boolean} marked - if any new statements were marked for inclusion
   */
  run(treeshake) {
    if (!treeshake) {
      // wk 如果不想treeshake，说明所有的语句都要保留，那么就直接执行statement.mark()(也就是每个statement.isIncluded都为true)
      this.statements.forEach((statement) => {
        if (statement.isImportDeclaration || (statement.isExportDeclaration && statement.node.isSynthetic)) return;

        statement.mark();
      });
      return false;
    }

    let marked = false;

    this.statements.forEach((statement) => {
      marked = statement.run(this.strongDependencies) || marked;
    });

    return marked;
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      originalCode: this.originalCode,
      ast: this.ast,
      sourceMapChain: this.sourceMapChain,
      resolvedIds: this.resolvedIds,
    };
  }

  trace(name) {
    // wk 找name是从哪个module的哪个declarations里拿出来的
    if (name in this.declarations) return this.declarations[name];
    if (name in this.imports) {
      const importDeclaration = this.imports[name];
      const otherModule = importDeclaration.module;

      if (importDeclaration.name === "*" && !otherModule.isExternal) {
        return otherModule.namespace();
      }

      const declaration = otherModule.traceExport(importDeclaration.name);

      if (!declaration)
        throw new Error(`Module ${otherModule.id} does not export ${importDeclaration.name} (imported by ${this.id})`);
      return declaration;
    }

    return null;
  }

  traceExport(name) {
    // export { foo } from './other.js'
    const reexportDeclaration = this.reexports[name];
    if (reexportDeclaration) {
      const declaration = reexportDeclaration.module.traceExport(reexportDeclaration.localName);

      if (!declaration) {
        const err = new Error(
          `'${reexportDeclaration.localName}' is not exported by '${reexportDeclaration.module.id}' (imported by '${this.id}')`
        );
        err.file = this.id;
        err.loc = getLocation(this.code, reexportDeclaration.start);
        throw err;
      }

      return declaration;
    }

    const exportDeclaration = this.exports[name];
    if (exportDeclaration) {
      const name = exportDeclaration.localName;
      const declaration = this.trace(name);

      if (declaration) return declaration;

      this.bundle.assumedGlobals[name] = true;
      return (this.declarations[name] = new SyntheticGlobalDeclaration(name));
    }

    for (let i = 0; i < this.exportAllModules.length; i += 1) {
      const module = this.exportAllModules[i];
      const declaration = module.traceExport(name);

      if (declaration) return declaration;
    }
  }
}
