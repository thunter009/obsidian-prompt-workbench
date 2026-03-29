import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { LLMAdapter, LLMGenerateInput } from './index'

// ── Binary resolution ──

let cachedBinaryPath: string | undefined

export function findClaudeBinary(): string | null {
  if (cachedBinaryPath) return cachedBinaryPath

  // 1. Try which/where
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude'
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (result) {
      cachedBinaryPath = result
      return result
    }
  } catch {
    // not on PATH
  }

  // 2. Probe common install locations
  const home = homedir()
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    join(home, '.local', 'bin', 'claude'),
    join(home, '.claude', 'bin', 'claude'),
    '/Applications/cmux.app/Contents/Resources/bin/claude',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedBinaryPath = candidate
      return candidate
    }
  }

  // Don't cache null — user may install while Obsidian is running
  return null
}

export function resetClaudeBinaryCache(): void {
  cachedBinaryPath = undefined
}

// ── Auth status ──

export type ClaudeCodeAuthResult =
  | { status: 'authenticated'; email: string; plan: string; orgName: string }
  | { status: 'not-authenticated'; message: string }
  | { status: 'not-installed' }
  | { status: 'error'; message: string }

export async function checkClaudeCodeAuth(): Promise<ClaudeCodeAuthResult> {
  const binary = findClaudeBinary()
  if (!binary) return { status: 'not-installed' }

  return new Promise((resolve) => {
    const child = spawn(binary, ['auth', 'status', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ status: 'error', message: 'Auth check timed out' })
    }, 10000)

    const stdoutChunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))

    child.on('close', (code) => {
      clearTimeout(timeout)
      try {
        const output = Buffer.concat(stdoutChunks).toString('utf-8').trim()
        const data = JSON.parse(output)

        if (data.loggedIn || data.authenticated) {
          resolve({
            status: 'authenticated',
            email: data.email || data.user?.email || '',
            plan: data.plan || data.tier || '',
            orgName: data.orgName || data.organization?.name || '',
          })
        } else {
          resolve({
            status: 'not-authenticated',
            message: data.message || 'Not signed in',
          })
        }
      } catch {
        resolve({
          status: 'error',
          message: code === 0 ? 'Could not parse auth response' : `Auth check failed (exit ${code})`,
        })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ status: 'error', message: err.message })
    })
  })
}

// ── Adapter ──

export class ClaudeCodeAdapter implements LLMAdapter {
  async *generate(input: LLMGenerateInput): AsyncIterable<string> {
    if (input.signal?.aborted) {
      throw new Error('Request aborted')
    }

    const binary = findClaudeBinary()
    if (!binary) {
      throw new Error('Claude Code CLI not found \u2014 install from claude.com/code')
    }

    const child = spawn(binary, [
      '-p',
      '--model', input.model,
      '--system-prompt', input.systemPrompt,
      '--no-session-persistence',
      '--tools', '',
      '--output-format', 'text',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Handle spawn errors (EACCES, out of PIDs, etc.) — unhandled 'error' events are fatal
    let spawnError: Error | null = null
    child.on('error', (err) => { spawnError = err })

    // Wire abort signal to kill child
    const onAbort = () => child.kill('SIGTERM')
    input.signal?.addEventListener('abort', onAbort)

    // Capture stderr for error reporting
    const stderrChunks: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    const decoder = new TextDecoder('utf-8')

    // Write prompt to stdin then close — swallow errors on destroyed stream
    child.stdin.on('error', () => {})
    child.stdin.write(input.prompt)
    child.stdin.end()

    // Yield stdout chunks as they arrive
    try {
      for await (const chunk of child.stdout) {
        yield decoder.decode(chunk as Buffer, { stream: true })
      }
      // Flush decoder
      const final = decoder.decode()
      if (final) yield final
    } finally {
      input.signal?.removeEventListener('abort', onAbort)
    }

    // Wait for exit and check status
    const exitCode = await new Promise<number | null>((resolve) => {
      if (child.exitCode !== null) {
        resolve(child.exitCode)
      } else {
        child.on('close', (code) => resolve(code))
      }
    })

    // Surface spawn errors (EACCES, EPERM, etc.)
    if (spawnError) {
      if (input.signal?.aborted) return
      throw new Error(`Claude Code failed to start: ${spawnError.message}`)
    }

    if (exitCode !== null && exitCode !== 0) {
      // Signal-killed (abort) — don't throw
      if (input.signal?.aborted) return

      const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
      throw new Error(stderr || `Claude Code exited with code ${exitCode}`)
    }
  }
}
