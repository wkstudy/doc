# 阅读 vite/client/client.ts(客户端)


## 总结

client.ts就是起了一个websocket，并对websocket相关的信息进行处理


## websocket相关

### websocket onmessage
message分成了六大类型 `connected  update  custom  full-reload  prune  error`,每种类型进行相应处理(这里的数据类型及详细数据结构可参考`import { HMRPayload } from 'types/hmrPayload'`)

#### connected
指websockect 连接成功, 比较简单，没有做任何操作，只有为了防止ws timeout 而一直ping
```
<!-- 类型 -->
export interface ConnectedPayload {
  type: 'connected'
}
```
```
<!-- 操作 -->
 case 'connected':
      console.log(`[vite] connected.`)
      // proxy(nginx, docker) hmr ws maybe caused timeout,
      // so send ping package let ws keep alive.
      setInterval(() => socket.send('ping'), __HMR_TIMEOUT__)
      break
```

#### update
有更新的时候（我理解是代码修改、hmr的时候），主要是两部分操作
1. 错误处理（区分第一次update 还是 其他update的时候）
2. 对于更新代码进行进一步处理（又分成两种类型）
   1. `js-update`
   2. `以link标签引入的css文件`
```
<!-- 类型 -->
export interface UpdatePayload {
  type: 'update'
  updates: Update[]
}
```
```
<!-- 操作 -->
// if this is the first update and there's already an error overlay, it
      // means the page opened with existing server compile error and the whole
      // module script failed to load (since one of the nested imports is 500).
      // in this case a normal update won't work and a full reload is needed.
      if (isFirstUpdate && hasErrorOverlay()) {
        window.location.reload()
        return
      } else {
        clearErrorOverlay()
        isFirstUpdate = false
      }
      payload.updates.forEach((update) => {
        if (update.type === 'js-update') {
          queueUpdate(fetchUpdate(update))
        } else {
          // css-update
          // this is only sent when a css file referenced with <link> is updated
          let { path, timestamp } = update
          path = path.replace(/\?.*/, '')
          // can't use querySelector with `[href*=]` here since the link may be
          // using relative paths so we need to use link.href to grab the full
          // URL for the include check.
          const el = (
            [].slice.call(
              document.querySelectorAll(`link`)
            ) as HTMLLinkElement[]
          ).find((e) => e.href.includes(path))
          if (el) {
            const newPath = `${path}${
              path.includes('?') ? '&' : '?'
            }t=${timestamp}`
            el.href = new URL(newPath, el.href).href
          }
          console.log(`[vite] css hot updated: ${path}`)
        }
      })
      break
```

#### custom
? 这里的类型是啥没太明白，好像是接受了一堆事件， 并执行
```
<!-- 类型 -->
export interface CustomPayload {
  type: 'custom'
  event: string
  data?: any
}
```
```
<!-- 操作 -->
const cbs = customListenersMap.get(payload.event)
      if (cbs) {
        cbs.forEach((cb) => cb(payload.data))
      }
      break
```
#### full-reload
html相关的文件变化的时候直接`location.reload()`
```
<!-- 类型 -->
export interface FullReloadPayload {
  type: 'full-reload'
  path?: string
}
```

```
<!-- 操作 -->
if (payload.path && payload.path.endsWith('.html')) {
        // if html file is edited, only reload the page if the browser is
        // currently on that page.
        const pagePath = location.pathname
        const payloadPath = base + payload.path.slice(1)
        if (
          pagePath === payloadPath ||
          (pagePath.endsWith('/') && pagePath + 'index.html' === payloadPath)
        ) {
          location.reload()
        }
        return
      } else {
        location.reload()
      }
      break
```
#### prune
HMR之后可能有些模块不需要引入了但后于一些副作用仍然存在，这部分代码需要清除
```
<!-- 类型 -->
export interface PrunePayload {
  type: 'prune'
  paths: string[]
}
```

```
<!-- 操作 -->
// After an HMR update, some modules are no longer imported on the page
      // but they may have left behind side effects that need to be cleaned up
      // (.e.g style injections)
      // TODO Trigger their dispose callbacks.
      payload.paths.forEach((path) => {
        const fn = pruneMap.get(path)
        if (fn) {
          fn(dataMap.get(path))
        }
      })
      break
```
#### error
错误处理
```
<!-- 类型 -->
export interface ErrorPayload {
  type: 'error'
  err: {
    [name: string]: any
    message: string
    stack: string
    id?: string
    frame?: string
    plugin?: string
    pluginCode?: string
    loc?: {
      file?: string
      line: number
      column: number
    }
  }
}
```
```
<!-- 操作 -->
const err = payload.err
      if (enableOverlay) {
        createErrorOverlay(err)
      } else {
        console.error(`[vite] Internal Server Error\n${err.stack}`)
      }
      break
```





### websocket onclose
断开连接
```
socket.addEventListener('close', async ({ wasClean }) => {
  if (wasClean) return
  console.log(`[vite] server connection lost. polling for restart...`)
  await waitForSuccessfulPing()
  location.reload()
})
```
