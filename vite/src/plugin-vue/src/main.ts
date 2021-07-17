import qs from 'querystring'
import path from 'path'
import { rewriteDefault, SFCBlock, SFCDescriptor } from '@vue/compiler-sfc'
import { ResolvedOptions } from '.'
import {
  createDescriptor,
  getPrevDescriptor,
  setDescriptor
} from './utils/descriptorCache'
import { PluginContext, TransformPluginContext } from 'rollup'
import { resolveScript } from './script'
import { transformTemplateInMain } from './template'
import { isOnlyTemplateChanged, isEqualBlock } from './handleHotUpdate'
import { RawSourceMap, SourceMapConsumer, SourceMapGenerator } from 'source-map'
import { createRollupError } from './utils/error'

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function transformMain(
  code: string,
  filename: string,
  options: ResolvedOptions,
  pluginContext: TransformPluginContext,
  ssr: boolean
) {
  const { root, devServer, isProduction } = options

  // prev descriptor is only set and used for hmr
  const prevDescriptor = getPrevDescriptor(filename)
  const { descriptor, errors } = createDescriptor(
    filename,
    code,
    root,
    isProduction
  )

  if (errors.length) {
    errors.forEach((error) =>
      pluginContext.error(createRollupError(filename, error))
    )
    return null
  }

  // feature information
  const hasScoped = descriptor.styles.some((s) => s.scoped)

  // script
  const { code: scriptCode, map } = await genScriptCode(
    descriptor,
    options,
    pluginContext,
    ssr
  )

  // template
  // Check if we can use compile template as inlined render function
  // inside <script setup>. This can only be done for build because
  // inlined template cannot be individually hot updated.
  const useInlineTemplate =
    !devServer &&
    descriptor.scriptSetup &&
    !(descriptor.template && descriptor.template.src)
  const hasTemplateImport = descriptor.template && !useInlineTemplate

  let templateCode = ''
  let templateMap
  if (hasTemplateImport) {
    ;({ code: templateCode, map: templateMap } = await genTemplateCode(
      descriptor,
      options,
      pluginContext,
      ssr
    ))
  }

  let renderReplace = ''
  if (hasTemplateImport) {
    renderReplace = ssr
      ? `_sfc_main.ssrRender = _sfc_ssrRender`
      : `_sfc_main.render = _sfc_render`
  } else {
    // #2128
    // User may empty the template but we didn't provide rerender function before
    if (
      prevDescriptor &&
      !isEqualBlock(descriptor.template, prevDescriptor.template)
    ) {
      renderReplace = ssr
        ? `_sfc_main.ssrRender = () => {}`
        : `_sfc_main.render = () => {}`
    }
  }

  // styles
  const stylesCode = await genStyleCode(descriptor, pluginContext)

  // custom blocks
  const customBlocksCode = await genCustomBlockCode(descriptor, pluginContext)

  const output: string[] = [
    scriptCode,
    templateCode,
    stylesCode,
    customBlocksCode,
    renderReplace
  ]
  if (hasScoped) {
    output.push(
      `_sfc_main.__scopeId = ${JSON.stringify(`data-v-${descriptor.id}`)}`
    )
  }
  if (devServer && !isProduction) {
    // expose filename during serve for devtools to pickup
    output.push(`_sfc_main.__file = ${JSON.stringify(filename)}`)
  }
  output.push('export default _sfc_main')

  // HMR
  if (
    devServer &&
    devServer.config.server.hmr !== false &&
    !ssr &&
    !isProduction
  ) {
    output.push(`_sfc_main.__hmrId = ${JSON.stringify(descriptor.id)}`)
    output.push(
      `typeof __VUE_HMR_RUNTIME__ !== 'undefined' && ` +
        `__VUE_HMR_RUNTIME__.createRecord(_sfc_main.__hmrId, _sfc_main)`
    )
    // check if the template is the only thing that changed
    if (prevDescriptor && isOnlyTemplateChanged(prevDescriptor, descriptor)) {
      output.push(`export const _rerender_only = true`)
    }
    output.push(
      `import.meta.hot.accept(({ default: updated, _rerender_only }) => {`,
      `  if (_rerender_only) {`,
      `    __VUE_HMR_RUNTIME__.rerender(updated.__hmrId, updated.render)`,
      `  } else {`,
      `    __VUE_HMR_RUNTIME__.reload(updated.__hmrId, updated)`,
      `  }`,
      `})`
    )
  }

  // SSR module registration by wrapping user setup
  if (ssr) {
    output.push(
      `import { useSSRContext as __vite_useSSRContext } from 'vue'`,
      `const _sfc_setup = _sfc_main.setup`,
      `_sfc_main.setup = (props, ctx) => {`,
      `  const ssrContext = __vite_useSSRContext()`,
      `  ;(ssrContext.modules || (ssrContext.modules = new Set())).add(${JSON.stringify(
        filename
      )})`,
      `  return _sfc_setup ? _sfc_setup(props, ctx) : undefined`,
      `}`
    )
  }

  // if the template is inlined into the main module (indicated by the presence
  // of templateMap, we need to concatenate the two source maps.
  let resolvedMap = map
  if (map && templateMap) {
    const generator = SourceMapGenerator.fromSourceMap(
      new SourceMapConsumer(map)
    )
    const offset = scriptCode.match(/\r?\n/g)?.length || 1
    const templateMapConsumer = new SourceMapConsumer(templateMap)
    templateMapConsumer.eachMapping((m) => {
      generator.addMapping({
        source: m.source,
        original: { line: m.originalLine, column: m.originalColumn },
        generated: {
          line: m.generatedLine + offset,
          column: m.generatedColumn
        }
      })
    })
    resolvedMap = (generator as any).toJSON()
    // if this is a template only update, we will be reusing a cached version
    // of the main module compile result, which has outdated sourcesContent.
    resolvedMap.sourcesContent = templateMap.sourcesContent
  }

  return {
    code: output.join('\n'),
    map: resolvedMap || {
      mappings: ''
    }
  }
}

async function genTemplateCode(
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  pluginContext: PluginContext,
  ssr: boolean
) {
  const template = descriptor.template!

  // If the template is not using pre-processor AND is not using external src,
  // compile and inline it directly in the main module. When served in vite this
  // saves an extra request per SFC which can improve load performance.
  if (!template.lang && !template.src) {
    return transformTemplateInMain(
      template.content,
      descriptor,
      options,
      pluginContext,
      ssr
    )
  } else {
    if (template.src) {
      await linkSrcToDescriptor(template.src, descriptor, pluginContext)
    }
    const src = template.src || descriptor.filename
    const srcQuery = template.src ? `&src` : ``
    const attrsQuery = attrsToQuery(template.attrs, 'js', true)
    const query = `?vue&type=template${srcQuery}${attrsQuery}`
    const request = JSON.stringify(src + query)
    const renderFnName = ssr ? 'ssrRender' : 'render'
    return {
      code: `import { ${renderFnName} as _sfc_${renderFnName} } from ${request}`,
      map: undefined
    }
  }
}

const exportDefaultClassRE =
  /(?:(?:^|\n|;)\s*)export\s+default\s+class\s+([\w$]+)/

async function genScriptCode(
  descriptor: SFCDescriptor,
  options: ResolvedOptions,
  pluginContext: PluginContext,
  ssr: boolean
): Promise<{
  code: string
  map: RawSourceMap
}> {
  let scriptCode = `const _sfc_main = {}`
  let map
  const script = resolveScript(descriptor, options, ssr)
  if (script) {
    // If the script is js/ts and has no external src, it can be directly placed
    // in the main module.
    if (
      (!script.lang || (script.lang === 'ts' && options.devServer)) &&
      !script.src
    ) {
      // TODO remove the class check logic after upgrading @vue/compiler-sfc
      const classMatch = script.content.match(exportDefaultClassRE)
      if (classMatch) {
        scriptCode =
          script.content.replace(exportDefaultClassRE, `\nclass $1`) +
          `\nconst _sfc_main = ${classMatch[1]}`
        if (/export\s+default/.test(scriptCode)) {
          // fallback if there are still export default
          scriptCode = rewriteDefault(script.content, `_sfc_main`)
        }
      } else {
        scriptCode = rewriteDefault(script.content, `_sfc_main`)
      }
      map = script.map
      if (script.lang === 'ts') {
        const result = await options.devServer!.transformWithEsbuild(
          scriptCode,
          descriptor.filename,
          { loader: 'ts' },
          map
        )
        scriptCode = result.code
        map = result.map
      }
    } else {
      if (script.src) {
        await linkSrcToDescriptor(script.src, descriptor, pluginContext)
      }
      const src = script.src || descriptor.filename
      const langFallback = (script.src && path.extname(src).slice(1)) || 'js'
      const attrsQuery = attrsToQuery(script.attrs, langFallback)
      const srcQuery = script.src ? `&src` : ``
      const query = `?vue&type=script${srcQuery}${attrsQuery}`
      const request = JSON.stringify(src + query)
      scriptCode =
        `import _sfc_main from ${request}\n` + `export * from ${request}` // support named exports
    }
  }
  return {
    code: scriptCode,
    map: map as any
  }
}

async function genStyleCode(
  descriptor: SFCDescriptor,
  pluginContext: PluginContext
) {
  let stylesCode = ``
  let hasCSSModules = false
  if (descriptor.styles.length) {
    for (let i = 0; i < descriptor.styles.length; i++) {
      const style = descriptor.styles[i]
      if (style.src) {
        await linkSrcToDescriptor(style.src, descriptor, pluginContext)
      }
      const src = style.src || descriptor.filename
      // do not include module in default query, since we use it to indicate
      // that the module needs to export the modules json
      const attrsQuery = attrsToQuery(style.attrs, 'css')
      const srcQuery = style.src ? `&src` : ``
      const query = `?vue&type=style&index=${i}${srcQuery}`
      const styleRequest = src + query + attrsQuery
      if (style.module) {
        if (!hasCSSModules) {
          stylesCode += `\nconst cssModules = _sfc_main.__cssModules = {}`
          hasCSSModules = true
        }
        stylesCode += genCSSModulesCode(i, styleRequest, style.module)
      } else {
        stylesCode += `\nimport ${JSON.stringify(styleRequest)}`
      }
      // TODO SSR critical CSS collection
    }
  }
  return stylesCode
}

async function genCustomBlockCode(
  descriptor: SFCDescriptor,
  pluginContext: PluginContext
) {
  let code = ''
  for (let index = 0; index < descriptor.customBlocks.length; index++) {
    const block = descriptor.customBlocks[index]
    if (block.src) {
      await linkSrcToDescriptor(block.src, descriptor, pluginContext)
    }
    const src = block.src || descriptor.filename
    const attrsQuery = attrsToQuery(block.attrs, block.type)
    const srcQuery = block.src ? `&src` : ``
    const query = `?vue&type=${block.type}&index=${index}${srcQuery}${attrsQuery}`
    const request = JSON.stringify(src + query)
    code += `import block${index} from ${request}\n`
    code += `if (typeof block${index} === 'function') block${index}(_sfc_main)\n`
  }
  return code
}

function genCSSModulesCode(
  index: number,
  request: string,
  moduleName: string | boolean
): string {
  const styleVar = `style${index}`
  const exposedName = typeof moduleName === 'string' ? moduleName : '$style'
  // inject `.module` before extension so vite handles it as css module
  const moduleRequest = request.replace(/\.(\w+)$/, '.module.$1')
  return (
    `\nimport ${styleVar} from ${JSON.stringify(moduleRequest)}` +
    `\ncssModules["${exposedName}"] = ${styleVar}`
  )
}

/**
 * For blocks with src imports, it is important to link the imported file
 * with its owner SFC descriptor so that we can get the information about
 * the owner SFC when compiling that file in the transform phase.
 */
async function linkSrcToDescriptor(
  src: string,
  descriptor: SFCDescriptor,
  pluginContext: PluginContext
) {
  const srcFile =
    (await pluginContext.resolve(src, descriptor.filename))?.id || src
  // #1812 if the src points to a dep file, the resolved id may contain a
  // version query.
  setDescriptor(srcFile.replace(/\?.*$/, ''), descriptor)
}

// these are built-in query parameters so should be ignored
// if the user happen to add them as attrs
const ignoreList = ['id', 'index', 'src', 'type', 'lang', 'module']

function attrsToQuery(
  attrs: SFCBlock['attrs'],
  langFallback?: string,
  forceLangFallback = false
): string {
  let query = ``
  for (const name in attrs) {
    const value = attrs[name]
    if (!ignoreList.includes(name)) {
      query += `&${qs.escape(name)}${
        value ? `=${qs.escape(String(value))}` : ``
      }`
    }
  }
  if (langFallback || attrs.lang) {
    query +=
      `lang` in attrs
        ? forceLangFallback
          ? `&lang.${langFallback}`
          : `&lang.${attrs.lang}`
        : `&lang.${langFallback}`
  }
  return query
}
