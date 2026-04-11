/**
 * gating.ts — Layer I: The Orchestration Layer
 *
 * This is the "High-Throughput Gating Model" from the spec.
 * It performs:
 *   1. Prompt Atomization   — decomposes the query into sub-tasks
 *   2. Expert Vector Mapping — assigns each sub-task to the right expert role
 *   3. Context Injection    — attaches RAG context (stub for now)
 *
 * Production target: Gemma 3 27B / Llama 4
 * Mid-tier substitute:  Qwen3-4B
 */

import { complete } from './hf';
import {
  type ExpertRole,
  type SubTask,
  EXPERT_MODELS,
  GATING_MODEL,
} from '../types/orchestrator';

export type GatingResult = {
  subTasks: SubTask[];
  contextSummary: string;
};

const GATING_SYSTEM = `You are an orchestration router for a Mixture-of-Agents (MoA) system.
Your job: analyze the user query and decompose it into 1–4 specialist sub-tasks.

Available expert roles:
- reasoning: logic, math, chain-of-thought, proofs, step-by-step deduction
- code: programming, algorithms, debugging, architecture, any language
- conversational: prose writing, tone, creativity, summarization, explanation
- scientific: domain knowledge — biology, chemistry, physics, statistics, data analysis

Rules:
- Simple queries need only 1 sub-task (e.g. "write a poem" → conversational only)
- Complex queries should be split appropriately (e.g. "write a Python script that explains itself" → code + conversational)
- Every sub-task must have a clear, specific prompt that can be answered independently
- Respond ONLY with valid JSON, no markdown fences, no commentary

JSON schema:
{
  "contextSummary": "brief note on what domain/context this query is in",
  "subTasks": [
    {
      "role": "reasoning" | "code" | "conversational" | "scientific",
      "description": "one sentence describing what this sub-task does",
      "prompt": "the exact prompt to send to the expert model for this sub-task"
    }
  ]
}`;

export async function gate(userQuery: string, chatHistory: string): Promise<GatingResult> {
  const userMsg = chatHistory
    ? `Chat history:\n${chatHistory}\n\nNew query: ${userQuery}`
    : userQuery;

  let raw = '';
  try {
    raw = await complete(
      GATING_MODEL,
      [
        { role: 'system', content: GATING_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      { maxTokens: 800, temperature: 0.1 }
    );
  } catch (err) {
    // Gating failure → fall back to single conversational sub-task
    console.warn('[gating] Gating model failed, using fallback:', err);
    return fallbackGating(userQuery);
  }

  // Strip any markdown fences the model might have added despite instructions
  const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();

  let parsed: { contextSummary: string; subTasks: Array<{ role: ExpertRole; description: string; prompt: string }> };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('[gating] JSON parse failed, using fallback. Raw:', raw.slice(0, 300));
    return fallbackGating(userQuery);
  }

  const subTasks: SubTask[] = (parsed.subTasks ?? []).map(st => ({
    id: crypto.randomUUID(),
    role: st.role,
    description: st.description,
    prompt: st.prompt,
    model: EXPERT_MODELS[st.role],
    status: 'pending' as const,
    output: '',
  }));

  // Clamp to at most 4 sub-tasks
  return {
    subTasks: subTasks.slice(0, 4),
    contextSummary: parsed.contextSummary ?? '',
  };
}

function fallbackGating(userQuery: string): GatingResult {
  return {
    contextSummary: 'General query',
    subTasks: [
      {
        id: crypto.randomUUID(),
        role: 'conversational',
        description: 'Answer the user query directly',
        prompt: userQuery,
        model: EXPERT_MODELS.conversational,
        status: 'pending',
        output: '',
      },
    ],
  };
}
