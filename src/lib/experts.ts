/**
 * experts.ts — Layer II: The Expert Backend
 *
 * Runs all sub-tasks in PARALLEL (Promise.allSettled).
 * Each expert has a specialized system prompt tuned to its role.
 *
 * Production targets:
 *   reasoning      → DeepSeek-V4 R1 (1T MoE)
 *   code           → Kimi K2.5 (1M ctx)
 *   conversational → GLM-5 / Llama 4 Behemoth
 *   scientific     → AlphaFold 3 / GLM-Z1
 *
 * Mid-tier substitutes (HF free tier):
 *   reasoning      → Qwen2.5-7B-Instruct
 *   code           → Qwen2.5-Coder-7B-Instruct
 *   conversational → Llama-3.2-3B-Instruct
 *   scientific     → Qwen3-8B
 */

import { complete } from './hf';
import type { ExpertRole, SubTask } from '../types/orchestrator';

// ─── Expert system prompts ────────────────────────────────────────────────────

const EXPERT_SYSTEMS: Record<ExpertRole, string> = {
  reasoning: `You are the Reasoning Core — a specialist in logical deduction, mathematical reasoning, 
and chain-of-thought analysis. 
- Work step-by-step. Show your reasoning explicitly.
- Validate each logical step before proceeding.
- Flag any assumptions. Be precise and rigorous.
- Output only the reasoning and conclusion, no filler.`,

  code: `You are the Code Sovereign — a specialist in software engineering, algorithm design, 
and polyglot code synthesis.
- Write clean, production-grade code with proper error handling.
- Include comments for non-obvious logic.
- Prefer clarity over cleverness.
- If multiple languages are relevant, note which is most appropriate.
- Output only the code and minimal necessary explanation.`,

  conversational: `You are the Conversational Engine — a specialist in natural language, 
creative prose, and human-aligned communication.
- Match tone to context: technical, casual, formal, or creative as needed.
- Be clear, engaging, and appropriately concise.
- Prioritize readability and flow.
- Output polished, publication-ready prose.`,

  scientific: `You are the Scientific Analysis Node — a specialist in domain-specific knowledge 
across biology, chemistry, physics, statistics, and data science.
- Ground answers in established science. Cite relevant principles.
- Use precise technical terminology.
- Flag uncertainty or areas requiring further research.
- Quantify where possible. Be methodical.`,
};

// ─── Run a single expert ──────────────────────────────────────────────────────

async function runExpert(task: SubTask, contextSummary: string): Promise<SubTask> {
  const t0 = Date.now();
  const contextNote = contextSummary
    ? `\n\nContext: ${contextSummary}`
    : '';

  try {
    const output = await complete(
      task.model,
      [
        { role: 'system', content: EXPERT_SYSTEMS[task.role] + contextNote },
        { role: 'user', content: task.prompt },
      ],
      { maxTokens: 1200, temperature: role_temperature(task.role) }
    );

    return {
      ...task,
      status: 'done',
      output,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ...task,
      status: 'error',
      output: '',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    };
  }
}

function role_temperature(role: ExpertRole): number {
  // Deterministic for reasoning/code; more creative for conversation
  return { reasoning: 0.1, code: 0.15, conversational: 0.7, scientific: 0.2 }[role];
}

// ─── Run all experts in parallel ─────────────────────────────────────────────

export async function runExperts(
  subTasks: SubTask[],
  contextSummary: string,
  onProgress: (updated: SubTask[]) => void
): Promise<SubTask[]> {
  // Mark all as running
  const running = subTasks.map(t => ({ ...t, status: 'running' as const }));
  onProgress([...running]);

  // Execute in parallel
  const settled = await Promise.allSettled(
    running.map(task => runExpert(task, contextSummary))
  );

  const results = settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return { ...running[i], status: 'error' as const, error: String(result.reason) };
  });

  onProgress([...results]);
  return results;
}
