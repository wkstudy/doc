import fs from 'fs'
import path from 'path'
import glob from 'fast-glob'
import { ResolvedConfig } from '..'
import { Loader, Plugin, build, transform } from 'esbuild'
import {
  KNOWN_ASSET_TYPES,
  JS_TYPES_RE,
  SPECIAL_QUERY_RE,
  OPTIMIZABLE_ENTRY_RE
} from '../constants'
import {
  createDebugger,
  normalizePath,
  isObject,
  cleanUrl,
  externalRE,
  dataUrlRE
} from '../utils'
import {
  createPluginContainer,
  PluginContainer
} from '../server/pluginContainer'
import { init, parse } from 'es-module-lexer' // WK 类似与babel，做词法分析的（https://blog.csdn.net/qq_42049445/article/details/115654324）
import MagicString from 'magic-string'
import { transformImportGlob } from '../importGlob'

const debug = createDebugger('vite:deps')

const htmlTypesRE = /\.(html|vue|svelte)$/

// A simple regex to detect import sources. This is only used on
// <script lang="ts"> blocks in vue (setup only) or svelte files, since
// seemingly unused imports are dropped by esbuild when transpiling TS which
// prevents it from crawling further.
// We can't use es-module-lexer because it can't handle TS, and don't want to
// use Acorn because it's slow. Luckily this doesn't have to be bullet proof
// since even missed imports can be caught at runtime, and false positives will
// simply be ignored.
const importsRE =
  /\bimport(?!\s+type)(?:[\w*{}\n\r\t, ]+from\s*)?\s*("[^"]+"|'[^']+')/gm

export async function scanImports(config: ResolvedConfig): Promise<{
  deps: Record<string, string>
  missing: Record<string, string>
}> {
  const s = Date.now()

  let entries: string[] = []

  const explicitEntryPatterns = config.optimizeDeps?.entries
  const buildInput = config.build.rollupOptions?.input

  if (explicitEntryPatterns) {
    entries = await globEntries(explicitEntryPatterns, config)
  } else if (buildInput) {
    const resolvePath = (p: string) => path.resolve(config.root, p)
    if (typeof buildInput === 'string') {
      entries = [resolvePath(buildInput)]
    } else if (Array.isArray(buildInput)) {
      entries = buildInput.map(resolvePath)
    } else if (isObject(buildInput)) {
      entries = Object.values(buildInput).map(resolvePath)
    } else {
      throw new Error('invalid rollupOptions.input value.')
    }
  } else {
    entries = await globEntries('**/*.html', config) // WK 默认取html为入口
  }

  // Non-supported entry file types and virtual files should not be scanned for
  // dependencies.
  entries = entries.filter(
    (entry) =>
      (JS_TYPES_RE.test(entry) || htmlTypesRE.test(entry)) &&
      fs.existsSync(entry)
  )

  if (!entries.length) {
    debug(`No entry HTML files detected`)
    return { deps: {}, missing: {} }
  } else {
    debug(`Crawling dependencies using entries:\n  ${entries.join('\n  ')}`)
  }

  const deps: Record<string, string> = {}
  const missing: Record<string, string> = {}
  const container = await createPluginContainer(config)
  const plugin = esbuildScanPlugin(config, container, deps, missing, entries)

  const { plugins = [], ...esbuildOptions } =
    config.optimizeDeps?.esbuildOptions ?? {}
// WK 进行esbuild打包，通过esbuildScanPlugin插件分析得到deps missing
  await Promise.all(
    entries.map((entry) =>
      build({
        write: false,
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        logLevel: 'error',
        plugins: [...plugins, plugin],
        ...esbuildOptions
      })
    )
  )

  debug(`Scan completed in ${Date.now() - s}ms:`, deps)

  return {
    deps,
    missing
  }
}

/**
 * // WK 返回config下符合pattern 格式文件的数组
 * @param pattern 
 * @param config 
 * @returns 
 */
function globEntries(pattern: string | string[], config: ResolvedConfig) {
  return glob(pattern, {
    cwd: config.root,
    ignore: [
      '**/node_modules/**',
      `**/${config.build.outDir}/**`,
      `**/__tests__/**`
    ],
    absolute: true
  })
}

const scriptModuleRE =
  /(<script\b[^>]*type\s*=\s*(?:"module"|'module')[^>]*>)(.*?)<\/script>/gims // WK type = module的script
export const scriptRE = /(<script\b(\s[^>]*>|>))(.*?)<\/script>/gims // 普通的script
export const commentRE = /<!--(.|[\r\n])*?-->/
const srcRE = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/im
const langRE = /\blang\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/im

/**
 * // WK 生成一个esbuild plugin
 * @param config 
 * @param container 
 * @param depImports 
 * @param missing 
 * @param entries 
 * @returns 
 */
function esbuildScanPlugin(
  config: ResolvedConfig,
  container: PluginContainer,
  depImports: Record<string, string>,
  missing: Record<string, string>,
  entries: string[]
): Plugin {
  const seen = new Map<string, string | undefined>()

  const resolve = async (id: string, importer?: string) => {
    const key = id + (importer && path.dirname(importer))
    if (seen.has(key)) {
      return seen.get(key)
    }
    const resolved = await container.resolveId(
      id,
      importer && normalizePath(importer)
    )
    const res = resolved?.id
    seen.set(key, res)
    return res
  }

  const include = config.optimizeDeps?.include
  const exclude = config.optimizeDeps?.exclude

  // WK 非入口文件的话，external设置为true
  const externalUnlessEntry = ({ path }: { path: string }) => ({
    path,
    external: !entries.includes(path)
  })

  return {
    name: 'vite:dep-scan',
    setup(build) {
      // external urls
      build.onResolve({ filter: externalRE }, ({ path }) => ({
        path,
        external: true // WK external为true表示只有在run-time时才打包
      }))

      // data urls
      build.onResolve({ filter: dataUrlRE }, ({ path }) => ({
        path,
        external: true
      }))

      // html types: extract script contents -----------------------------------
      build.onResolve({ filter: htmlTypesRE }, async ({ path, importer }) => {
        return {
          path: await resolve(path, importer),
          namespace: 'html'
        }
      })

      // WK 把html /vue / svelte 里的js相关的东西整理为一个js module（保存在js变量里）并返回
      // extract scripts inside HTML-like files and treat it as a js module
      build.onLoad(
        { filter: htmlTypesRE, namespace: 'html' },
        async ({ path }) => {
          let raw = fs.readFileSync(path, 'utf-8')
          // Avoid matching the content of the comment
          raw = raw.replace(commentRE, '')
          const isHtml = path.endsWith('.html')
          const regex = isHtml ? scriptModuleRE : scriptRE
          regex.lastIndex = 0
          let js = ''
          let loader: Loader = 'js'
          let match
          while ((match = regex.exec(raw))) {
            // WK openTag 是<script> 开始标签的所有内容
            // WK htmlContent 在scriptModuleRE 是script标签里的内容，在scriptRE是<script   > 开始标签里除了script的内容
            // WK scriptContent  在scriptModuleRE里没有这个，在scriptRE是script标签之间的内容
            const [, openTag, htmlContent, scriptContent] = match
            const content = isHtml ? htmlContent : scriptContent // WK content是<script></script>里的内容
            const srcMatch = openTag.match(srcRE)
            const langMatch = openTag.match(langRE)
            const lang =
              langMatch && (langMatch[1] || langMatch[2] || langMatch[3])
            if (lang === 'ts' || lang === 'tsx' || lang === 'jsx') {
              loader = lang
            }
            if (srcMatch) {
              // WK 一般是html会有src属性，这里把src的东西改为import 引入
              const src = srcMatch[1] || srcMatch[2] || srcMatch[3]
              js += `import ${JSON.stringify(src)}\n`
            } else if (content.trim()) {
              // WK 这里是把script标签内部的js代码放到js变量里
              js += content + '\n'
            }
          }

          // WK 顶级await支持的 处理(此时js里如果有await的话，并不在async里，所以会出问题)
          // <script setup> may contain TLA which is not true TLA but esbuild
          // will error on it, so replace it with another operator.
          if (js.includes('await')) {
            js = js.replace(/\bawait(\s)/g, 'void$1')
          }

          // WK 特殊情况处理（TS + (Vue + <script setup>) or Svelte，esbuild无法进行解析import，这里的解决方案是强制加一条`import x `
          if (
            loader.startsWith('ts') &&
            (path.endsWith('.svelte') ||
              (path.endsWith('.vue') && /<script\s+setup/.test(raw)))
          ) {
            // when using TS + (Vue + <script setup>) or Svelte, imports may seem
            // unused to esbuild and dropped in the build output, which prevents
            // esbuild from crawling further.
            // the solution is to add `import 'x'` for every source to force
            // esbuild to keep crawling due to potential side effects.
            let m
            const original = js
            while ((m = importsRE.exec(original)) !== null) {
              // This is necessary to avoid infinite loops with zero-width matches
              if (m.index === importsRE.lastIndex) {
                importsRE.lastIndex++
              }
              js += `\nimport ${m[1]}`
            }
          }

          if (!js.includes(`export default`)) {
            js += `\nexport default {}`
          }

          if (js.includes('import.meta.glob')) {
            return {
              // transformGlob already transforms to js
              loader: 'js',
              contents: await transformGlob(js, path, config.root, loader)
            }
          }

          return {
            loader,
            contents: js
          }
        }
      )

      // bare imports: record and externalize ----------------------------------
      build.onResolve(
        {
          // WK 不匹配类似 base64这种的路径
          // avoid matching windows volume
          filter: /^[\w@][^:]/
        },
        async ({ path: id, importer }) => {
          if (exclude?.some((e) => e === id || id.startsWith(e + '/'))) {
            return externalUnlessEntry({ path: id })
          }
          if (depImports[id]) {
            return externalUnlessEntry({ path: id })
          }
          const resolved = await resolve(id, importer)
          if (resolved) {
            if (shouldExternalizeDep(resolved, id)) {
              return externalUnlessEntry({ path: id })
            }
            if (resolved.includes('node_modules') || include?.includes(id)) {
              // dependency or forced included, externalize and stop crawling
              if (OPTIMIZABLE_ENTRY_RE.test(resolved)) {
                depImports[id] = resolved
              }
              return externalUnlessEntry({ path: id })
            } else {
              // linked package, keep crawling
              return {
                path: path.resolve(resolved)
              }
            }
          } else {
            missing[id] = normalizePath(importer)
          }
        }
      )

      // Externalized file types -----------------------------------------------
      // these are done on raw ids using esbuild's native regex filter so it
      // should be faster than doing it in the catch-all via js
      // they are done after the bare import resolve because a package name
      // may end with these extensions

      // css & json
      build.onResolve(
        {
          filter: /\.(css|less|sass|scss|styl|stylus|pcss|postcss|json)$/
        },
        externalUnlessEntry
      )

      // known asset types
      build.onResolve(
        {
          filter: new RegExp(`\\.(${KNOWN_ASSET_TYPES.join('|')})$`)
        },
        externalUnlessEntry
      )

      // known vite query types: ?worker, ?raw
      build.onResolve({ filter: SPECIAL_QUERY_RE }, ({ path }) => ({
        path,
        external: true
      }))

      // catch all -------------------------------------------------------------

      build.onResolve(
        {
          filter: /.*/
        },
        async ({ path: id, importer }) => {
          // use vite resolver to support urls and omitted extensions
          const resolved = await resolve(id, importer)
          if (resolved) {
            if (shouldExternalizeDep(resolved, id)) {
              return externalUnlessEntry({ path: id })
            }

            const namespace = htmlTypesRE.test(resolved) ? 'html' : undefined

            return {
              path: path.resolve(cleanUrl(resolved)),
              namespace
            }
          } else {
            // resolve failed... probably unsupported type
            return externalUnlessEntry({ path: id })
          }
        }
      )

      // for jsx/tsx, we need to access the content and check for
      // presence of import.meta.glob, since it results in import relationships
      // but isn't crawled by esbuild.
      build.onLoad({ filter: JS_TYPES_RE }, ({ path: id }) => {
        let ext = path.extname(id).slice(1)
        if (ext === 'mjs') ext = 'js'

        let contents = fs.readFileSync(id, 'utf-8')
        if (ext.endsWith('x') && config.esbuild && config.esbuild.jsxInject) {
          contents = config.esbuild.jsxInject + `\n` + contents
        }

        if (contents.includes('import.meta.glob')) {
          return transformGlob(contents, id, config.root, ext as Loader).then(
            (contents) => ({
              loader: ext as Loader,
              contents
            })
          )
        }
        return {
          loader: ext as Loader,
          contents
        }
      })
    }
  }
}
// WK glob导入的模块的import语法的转换（https://cn.vitejs.dev/guide/features.html#glob-import）
async function transformGlob(
  source: string,
  importer: string,
  root: string,
  loader: Loader
) {
  // transform the content first since es-module-lexer can't handle non-js
  if (loader !== 'js') {
    source = (await transform(source, { loader })).code
  }

  await init
  const imports = parse(source)[0]
  const s = new MagicString(source)
  for (let index = 0; index < imports.length; index++) {
    const { s: start, e: end, ss: expStart } = imports[index]
    const url = source.slice(start, end)
    if (url !== 'import.meta') continue
    if (source.slice(end, end + 5) !== '.glob') continue
    const { importsString, exp, endIndex } = await transformImportGlob(
      source,
      start,
      normalizePath(importer),
      index,
      root
    )
    s.prepend(importsString)
    s.overwrite(expStart, endIndex, exp)
  }
  return s.toString()
}

/**
 * // WK 是否把这个resolvedId 的external属性设为true
 * @param resolvedId 
 * @param rawId 
 * @returns 
 */
export function shouldExternalizeDep(
  resolvedId: string,
  rawId: string
): boolean {
  // WK 不是绝对路径设为true
  // not a valid file path
  if (!path.isAbsolute(resolvedId)) {
    return true
  }
  // WK 虚拟resolvedId设为true
  // virtual id
  if (resolvedId === rawId || resolvedId.includes('\0')) {
    return true
  }
  // WK 不是js且属于 html/vue/svelte设为true
  // resolved is not a scannable type
  if (!JS_TYPES_RE.test(resolvedId) && !htmlTypesRE.test(resolvedId)) {
    return true
  }
  return false
}
