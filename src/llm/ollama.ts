import type { LLMAdapter, LLMGenerateInput } from './index'

interface OllamaGenerateChunk {
  response?: string
  error?: string
}

export class OllamaAdapter implements LLMAdapter {
  constructor(private readonly config: { url: string }) {}

  async *generate(input: LLMGenerateInput): AsyncIterable<string> {
    const response = await fetch(`${this.config.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        system: input.systemPrompt,
        prompt: input.prompt,
        stream: true,
      }),
      signal: input.signal ?? AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      const message = await response.text().catch(() => 'Ollama request failed')
      throw new Error(message)
    }

    if (!response.body) throw new Error('No response body from Ollama')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const parseLine = (line: string): OllamaGenerateChunk | null => {
      const trimmed = line.trim()
      if (!trimmed) return null
      try { return JSON.parse(trimmed) } catch { return null }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const chunk = parseLine(line)
        if (!chunk) continue
        if (chunk.error) throw new Error(chunk.error)
        if (chunk.response) yield chunk.response
      }
    }

    buffer += decoder.decode()
    for (const line of buffer.split('\n')) {
      const chunk = parseLine(line)
      if (!chunk) continue
      if (chunk.error) throw new Error(chunk.error)
      if (chunk.response) yield chunk.response
    }
  }
}
