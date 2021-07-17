import path from 'path'
import slash from 'slash'
import hash from 'hash-sum'
import { CompilerError, parse, SFCDescriptor } from '@vue/compiler-sfc'

// node_modules/@vue/compiler-sfc/dist/compiler-sfc.d.ts SFCParseResult should be exported so it can be re-used
export interface SFCParseResult {
  descriptor: SFCDescriptor
  errors: Array<CompilerError | SyntaxError>
}

const cache = new Map<string, SFCDescriptor>()
const prevCache = new Map<string, SFCDescriptor | undefined>()

export function createDescriptor(
  filename: string,
  source: string,
  root: string,
  isProduction: boolean | undefined
): SFCParseResult {
  const { descriptor, errors } = parse(source, {
    filename,
    sourceMap: true
  })

  // ensure the path is normalized in a way that is consistent inside
  // project (relative to root) and on different systems.
  const normalizedPath = slash(path.normalize(path.relative(root, filename)))
  descriptor.id = hash(normalizedPath + (isProduction ? source : ''))

  cache.set(filename, descriptor)
  return { descriptor, errors }
}

export function getPrevDescriptor(filename: string): SFCDescriptor | undefined {
  return prevCache.get(filename)
}

export function setPrevDescriptor(
  filename: string,
  entry: SFCDescriptor
): void {
  prevCache.set(filename, entry)
}

export function getDescriptor(
  filename: string,
  errorOnMissing = true
): SFCDescriptor | undefined {
  if (cache.has(filename)) {
    return cache.get(filename)!
  }
  if (errorOnMissing) {
    throw new Error(
      `${filename} has no corresponding SFC entry in the cache. ` +
        `This is a @vitejs/plugin-vue internal error, please open an issue.`
    )
  }
}

export function setDescriptor(filename: string, entry: SFCDescriptor): void {
  cache.set(filename, entry)
}
