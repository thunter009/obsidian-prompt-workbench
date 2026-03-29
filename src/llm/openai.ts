import type { LLMAdapter, LLMGenerateInput } from './index'

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string } }>
  error?: { message?: string }
}

export class OpenAIAdapter implements LLMAdapter {
  constructor(private readonly config: { baseUrl: string; apiKey: string }) {}

  async *generate(input: LLMGenerateInput): AsyncIterable<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        stream: true,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.prompt },
        ],
      }),
      signal: input.signal ?? AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      const message = await response.text().catch(() => 'OpenAI request failed')
      throw new Error(message)
    }

    if (!response.body) throw new Error('No response body from OpenAI')

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

        for (const rawLine of rawEvent.split('\n')) {
          const line = rawLine.trim()
          if (!line || !line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') return

          let chunk: OpenAIChunk
          try { chunk = JSON.parse(payload) } catch { continue }
          if (chunk.error?.message) throw new Error(chunk.error.message)
          const text = chunk.choices?.[0]?.delta?.content
          if (text) yield text
        }

        boundary = buffer.indexOf('\n\n')
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      for (const rawLine of buffer.split('\n')) {
        const line = rawLine.trim()
        if (!line || !line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return
        let chunk: OpenAIChunk
        try { chunk = JSON.parse(payload) } catch { continue }
        if (chunk.error?.message) throw new Error(chunk.error.message)
        const text = chunk.choices?.[0]?.delta?.content
        if (text) yield text
      }
    }
  }
}
