export interface Strategy {
  id: string
  name: string
  description: string
  systemPrompt: string
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'concise',
    name: 'Make concise',
    description: 'Remove redundancy, tighten wording',
    systemPrompt: `You are a prompt engineering expert. Rewrite the given prompt to be more concise and direct. Remove redundant phrases, unnecessary qualifiers, and verbose instructions. Keep the same intent and all placeholders intact. Return ONLY the improved prompt text, no explanation.`,
  },
  {
    id: 'detailed',
    name: 'Add detail',
    description: 'Add specificity, examples, constraints',
    systemPrompt: `You are a prompt engineering expert. Enhance the given prompt by adding specific constraints, examples, edge cases, and output format guidance. Make it more robust and likely to produce high-quality results. Keep all placeholders intact. Return ONLY the improved prompt text, no explanation.`,
  },
  {
    id: 'restructure',
    name: 'Restructure',
    description: 'Reorganize for clarity and flow',
    systemPrompt: `You are a prompt engineering expert. Reorganize the given prompt for better logical flow. Group related instructions, add clear section headers if helpful, and ensure the most important constraints come first. Keep all placeholders intact. Return ONLY the improved prompt text, no explanation.`,
  },
  {
    id: 'general',
    name: 'General improve',
    description: 'Overall quality improvement',
    systemPrompt: `You are a prompt engineering expert. Improve the given prompt to be clearer, more specific, and more effective at producing the desired output. Fix any ambiguity, add useful constraints, and improve the structure. Keep all placeholders intact. Return ONLY the improved prompt text, no explanation.`,
  },
]

export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id)
}
