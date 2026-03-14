import type { LLMAdapter, LLMGenerateInput } from './index'

interface AnthropicStreamPayload {
  error?: { message?: string }
  delta?: { text?: string }
}

export class AnthropicAdapter implements LLMAdapter {
  constructor(private readonly config: { baseUrl: string; apiKey: string }) {}

  async *generate(input: LLMGenerateInput): AsyncIterable<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 4096,
        stream: true,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.prompt }],
      }),
      signal: input.signal ?? AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const message = await response.text().catch(() => 'Anthropic request failed')
      throw new Error(message)
    }

    if (!response.body) throw new Error('No response body from Anthropic')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        let eventType = 'message'
        for (const rawLine of rawEvent.split('\n')) {
          const line = rawLine.trim()
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const payload = line.slice(5).trim()
            let parsed: AnthropicStreamPayload
            try { parsed = JSON.parse(payload) } catch { continue }
            if (parsed.error?.message) throw new Error(parsed.error.message)
            if (eventType === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text
            }
          }
        }

        boundary = buffer.indexOf('\n\n')
      }
    }
  }
}
