import { AnthropicAdapter } from './anthropic'
import { OllamaAdapter } from './ollama'
import { OpenAIAdapter } from './openai'

export type LLMProvider = 'ollama' | 'openai' | 'anthropic'

export interface LLMGenerateInput {
  prompt: string
  systemPrompt: string
  model: string
  signal?: AbortSignal
}

export interface LLMAdapter {
  generate(input: LLMGenerateInput): AsyncIterable<string>
}

export interface LLMAdapterConfig {
  provider: LLMProvider
  ollamaUrl?: string
  openaiBaseUrl?: string
  openaiApiKey?: string
  anthropicBaseUrl?: string
  anthropicApiKey?: string
}

export function createLLMAdapter(config: LLMAdapterConfig): LLMAdapter {
  if (config.provider === 'ollama') {
    return new OllamaAdapter({
      url: config.ollamaUrl || 'http://localhost:11434',
    })
  }

  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key required')
    }
    return new OpenAIAdapter({
      baseUrl: config.openaiBaseUrl || 'https://api.openai.com/v1',
      apiKey: config.openaiApiKey,
    })
  }

  if (config.provider !== 'anthropic') {
    throw new Error(`Unknown LLM provider: ${config.provider}`)
  }
  if (!config.anthropicApiKey) {
    throw new Error('Anthropic API key required')
  }
  return new AnthropicAdapter({
    baseUrl: config.anthropicBaseUrl || 'https://api.anthropic.com/v1',
    apiKey: config.anthropicApiKey,
  })
}
