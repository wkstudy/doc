import path from 'path'
import sirv from 'sirv'
import chalk from 'chalk'
import connect from 'connect'
import compression from 'compression'
import { ResolvedConfig } from '.'
import { Connect } from 'types/connect'
import { resolveHttpsConfig, resolveHttpServer } from './server/http'
import { openBrowser } from './server/openBrowser'
import corsMiddleware from 'cors'
import { proxyMiddleware } from './server/middlewares/proxy'
import { printServerUrls } from './logger'
import { resolveHostname } from './utils'

export async function preview(
  config: ResolvedConfig,
  port = 5000
): Promise<void> {
  const app = connect() as Connect.Server
  const httpServer = await resolveHttpServer(
    config.server,
    app,
    await resolveHttpsConfig(config)
  )

  // cors
  const { cors } = config.server
  if (cors !== false) {
    app.use(corsMiddleware(typeof cors === 'boolean' ? {} : cors))
  }

  // proxy
  if (config.server.proxy) {
    app.use(proxyMiddleware(httpServer, config))
  }

  app.use(compression())

  const distDir = path.resolve(config.root, config.build.outDir)
  app.use(
    config.base,
    sirv(distDir, {
      etag: true,
      single: true
    })
  )

  const options = config.server
  const hostname = resolveHostname(options.host)
  const protocol = options.https ? 'https' : 'http'
  const logger = config.logger
  const base = config.base

  httpServer.listen(port, hostname.host, () => {
    logger.info(
      chalk.cyan(`\n  vite v${require('vite/package.json').version}`) +
        chalk.green(` build preview server running at:\n`)
    )

    printServerUrls(hostname, protocol, port, base, logger.info)

    if (options.open) {
      const path = typeof options.open === 'string' ? options.open : base
      openBrowser(`${protocol}://${hostname.name}:${port}${path}`, true, logger)
    }
  })
}
