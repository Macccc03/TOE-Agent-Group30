import { resourceFromAttributes } from '@opentelemetry/resources'
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { HarnessCollector } from './probe-core.mjs'
import { TeamJsonExporter } from './team-exporter.mjs'

export const name = 'harness-trace-probe'

export function apply(ctx) {
  const exporter = new TeamJsonExporter(
    process.env.DSH_TEAM_ENDPOINT ?? 'http://127.0.0.1:6007/api/spans',
  )
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'deepseek-harness' }),
    spanProcessors: [new BatchSpanProcessor(exporter, {
      scheduledDelayMillis: 500,
      maxExportBatchSize: 32,
      maxQueueSize: 1024,
      exportTimeoutMillis: 10000,
    })],
  })
  const limit = Number(process.env.DSH_CAPTURE_MAX_CHARS ?? 16000)
  const collector = new HarnessCollector(provider.getTracer('harness-trace-probe', '0.2.0'), {
    captureContent: process.env.DSH_CAPTURE_CONTENT !== 'false',
    maxChars: Number.isFinite(limit) ? Math.min(16000, Math.max(256, Math.floor(limit))) : 16000,
  })

  ctx.on('session/event', (session, event) => collector.safe(() => collector.onEvent(session, event)))
  ctx.on('session/disposed', (session) => collector.safe(() => collector.closeSession(session.id)))
  ctx.on('session/flush', async () => {
    try { await provider.forceFlush() }
    catch { console.warn('[dsh-probe] trace flush failed; see exporter diagnostics') }
  })
  ctx.on('llm/stream', (options, next) => collector.wrapStream(options, next))

  // Cordis owns cleanup. No process-global handlers and no forced process.exit().
  ctx.effect(() => async () => {
    collector.safe(() => collector.closeAll())
    try { await provider.forceFlush() }
    catch { console.warn('[dsh-probe] trace flush failed during disposal') }
    try { await provider.shutdown() }
    catch { console.warn('[dsh-probe] exporter shutdown failed') }
    console.log('[dsh-probe] export summary', JSON.stringify(exporter.stats))
  })
  console.log('[dsh-probe] loaded v0.2.0 (turn/step/tool/llm)')
}