import { ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

export const name = 'harness-trace-probe'

export function apply(ctx) {
  // 保存已经开始、还没结束的操作。
  const exporter = new OTLPTraceExporter({
    url: process.env.DSH_TRACE_ENDPOINT ?? 'http://127.0.0.1:6006/v1/traces',
  })

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      'service.name': 'deepseek-harness',
      'openinference.project.name': 'deepseek-harness-demo',
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  })

  const tracer = provider.getTracer('harness-trace-probe')
  const open = new Map()

  function start(id, parentId, kind, name, time) {
    const parent = parentId === null ? undefined : open.get(parentId)
    if (parentId !== null && !parent) {
      console.warn('[dsh-probe] missing parent', parentId)
      return
    }

    const parentContext = parent
      ? trace.setSpan(ROOT_CONTEXT, parent.span)
      : ROOT_CONTEXT

    const span = tracer.startSpan(name, {
      startTime: new Date(time),
      attributes: {
        'openinference.span.kind': kind,
        'dsh.node.id': id,
      },
    }, parentContext)

    open.set(id, { id, parentId, kind, name, startTime: time, span })
  }

  function end(id, time, extra = {}) {
    const entry = open.get(id)
    if (!entry) {
      console.warn('[dsh-probe] missing start', id)
      return
    }

    open.delete(id)
    const { span, ...node } = entry

    if (extra.isError === true || extra.reason?.kind === 'error') {
      span.setStatus({ code: SpanStatusCode.ERROR })
    } else if (extra.isError === false || extra.reason?.kind === 'completed') {
      span.setStatus({ code: SpanStatusCode.OK })
    }

    if (typeof extra.reason?.kind === 'string') {
      span.setAttribute('dsh.turn.end_reason', extra.reason.kind)
    }

    span.end(new Date(time))

    console.log('[dsh-span]', JSON.stringify({
      ...node,
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      endTime: time,
      durationMs: time - node.startTime,
      ...extra,
    }))
  }

  console.log('[dsh-probe] loaded')

  ctx.on('session/event', (session, event) => {
    const { type, data, time } = event
    if (typeof data?.turn !== 'number') return

    const turnId = `${session.id}/turn/${data.turn}`
    const stepId = `${turnId}/step/${data.step}`

    switch (type) {
      case 'turn/start':
        start(turnId, null, 'AGENT', `Turn ${data.turn}`, time)
        break

      case 'step/start':
        start(stepId, turnId, 'CHAIN', `Step ${data.step}`, time)
        break

      case 'tool/call':
        if (!data.callId) break
        start(`${stepId}/tool/${data.callId}`, stepId, 'TOOL', data.name, time)
        break

      case 'tool/result': {
        const callId = data.message?.toolCallId
        if (!callId) break

        end(`${stepId}/tool/${callId}`, time, {
          isError: data.message.isError ?? null,
        })
        break
      }

      case 'step/end':
        end(stepId, time)
        break

      case 'turn/end':
        end(turnId, time, { reason: data.reason })

        // 清理这一轮没有收到结束事件的子节点，并保留诊断信息。
        for (const id of open.keys()) {
          if (id.startsWith(`${turnId}/`)) {
            console.warn('[dsh-probe] unfinished', id)
            open.delete(id)
          }
        }
        break
    }
  })
}