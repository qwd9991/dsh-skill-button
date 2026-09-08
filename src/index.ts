/**
 * @dsh-external/dsh-skill-picker — Host side entry point.
 *
 * Exposes a translation endpoint backed by the user's configured DSH model
 * (the model selected in Settings / the composer model seat). The browser
 * client calls `POST /skill-picker/api/translate` for any skill not yet
 * translated; the host streams a translation from the configured LLM and
 * returns `{ zhName, zhDesc }`. If no model is configured or the LLM call
 * fails, the client falls back to its offline rule engine / free API.
 */
import type { Context } from 'cordis'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = "@dsh-external/dsh-skill-picker"

export const inject = ['llm', 'agentDefaultModel', 'webServer'] as const

interface TranslateBody {
  name?: string
  description?: string
  sessionId?: string
}

interface ModelRoute {
  provider: string
  model: string
}

/** Minimal webserver route shape the host plugin registers against. */
interface WebServerRoute {
  kind: 'prefix' | 'exact'
  path: string
  handler: (req: any, res: any) => void | Promise<void>
}

/** Host-side context augmented with the two services not declared on Context. */
interface AppContext extends Context {
  llm: {
    stream(options: Record<string, unknown>): AsyncIterable<{ type: string; text?: string }>
  }
  agentDefaultModel: {
    currentSelection(): ModelRoute & { reasoningEffort?: string }
  }
  webServer: {
    register(route: WebServerRoute, label: string): () => void
  }
}

const TRANSLATE_SYSTEM = [
  'You are a professional AI translation engine for software skills.',
  'You translate an AI Agent Skill name and its English description into concise, natural, professional Simplified Chinese.',
  'Return ONLY a single JSON object with exactly two fields and no extra prose, Markdown fences, or code blocks.',
  'Shape: {"zhName":"<concise Chinese title, optionally keeping the English name in parentheses>","zhDesc":"<concise Chinese description>"}',
].join('\n')

async function translateWithModel(
  ctx: AppContext,
  route: ModelRoute,
  name: string,
  description: string,
): Promise<{ zhName: string; zhDesc: string }> {
  const prompt =
    `Translate this AI Agent Skill into natural Simplified Chinese.\n` +
    `Name: ${name}\nDescription: ${description}\n\n` +
    `Return JSON: {"zhName":"...","zhDesc":"..."}`

  const options: Record<string, unknown> = {
    provider: route.provider,
    model: route.model,
    messages: [createUserMessage({
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'plugin', plugin: name },
    })],
    system: TRANSLATE_SYSTEM,
    maxTokens: 200,
  }

  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) {
    assembler.push(chunk as never)
  }

  const text = assembler.blocks()
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')

  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('LLM response was not JSON: ' + text.slice(0, 120))
  }
  const parsed = JSON.parse(match[0])
  const zhName = String(parsed.zhName ?? '').trim()
  const zhDesc = String(parsed.zhDesc ?? '').trim()
  if (!zhName && !zhDesc) {
    throw new Error('LLM returned neither zhName nor zhDesc')
  }
  return { zhName, zhDesc }
}

export function apply(ctx: AppContext): void {
  ctx.effect(() => {
    const d = ctx.webServer.register({
      kind: 'prefix',
      path: '/skill-picker/api/translate',
      handler: async (req: any, res: any) => {
        const json = (body: unknown, code = 200) => {
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(body))
        }

        let raw = ''
        try {
          for await (const chunk of req) raw += chunk
        } catch {
          /* ignore body read errors */
        }

        let body: TranslateBody
        try {
          body = JSON.parse(raw || '{}')
        } catch {
          return json({ ok: false, error: 'body is not valid JSON' }, 400)
        }

        const name = body?.name
        const description = body?.description
        if (!name || !description) {
          return json({ ok: false, error: 'name and description are required' }, 400)
        }

        let route: ModelRoute | undefined
        try {
          const selection = ctx.agentDefaultModel.currentSelection()
          if (selection?.provider && selection?.model) {
            route = { provider: selection.provider, model: selection.model }
          }
        } catch {
          /* no default model */
        }
        if (!route) {
          return json({ ok: false, error: 'no model configured' })
        }

        try {
          const result = await translateWithModel(ctx, route, name, description)
          return json({ ok: true, zhName: result.zhName, zhDesc: result.zhDesc })
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }, 'skill-picker: translate api')
    return () => d()
  })
}
