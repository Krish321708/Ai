/**
 * synthesis.ts — Layer III: The Synthesis Agent
 *
 * From the spec: "A final Synthesis Agent weaves the verified components 
 * into a single, cohesive response, maintaining a consistent persona and 
 * technical depth throughout."
 *
 * This is the ONLY streaming step — the user sees this output live.
 * Production model: dedicated synthesis LLM
 * Mid-tier substitute: Qwen2.5-7B-Instruct
 */

import { stream } from './hf';
import { SYNTHESIS_MODEL } from '../types/orchestrator';
import type { SubTask } from '../types/orchestrator';

const SYNTHESIS_SYSTEM = `You are the Synthesis Agent — the final layer of a Mixture-of-Agents pipeline.

You receive:
- The original user query
- Outputs from specialist expert models (reasoning, code, conversational, scientific)
- Verification notes from the audit pass

Your job is to weave these into ONE cohesive, polished response that:
1. Directly answers the user's original question
2. Integrates all relevant expert contributions seamlessly
3. Maintains consistent tone, persona, and technical depth throughout
4. Does NOT mention the pipeline, agents, or internal process — just respond naturally
5. Uses markdown formatting where helpful (code blocks, headers, lists)

Be thorough but not redundant. Start your response immediately — no preamble.`;

export async function* synthesize(
  originalQuery: string,
  subTasks: SubTask[],
  verificationNotes: string,
  contextSummary: string
): AsyncGenerator<string> {
  const expertOutputs = subTasks
    .filter(t => t.status === 'done' && t.output)
    .map(t => `## ${t.role.toUpperCase()} EXPERT\nTask: ${t.description}\n\n${t.output}`)
    .join('\n\n---\n\n');

  const failedTasks = subTasks.filter(t => t.status === 'error');
  const failureNote = failedTasks.length > 0
    ? `\n\nNOTE: The following experts failed and should be handled gracefully: ${failedTasks.map(t => t.role).join(', ')}`
    : '';

  const userContent = `Original query: ${originalQuery}

${contextSummary ? `Context: ${contextSummary}\n` : ''}
Expert outputs:
${expertOutputs || '(no expert outputs — respond directly to the query)'}

Verification notes: ${verificationNotes}
${failureNote}

Synthesize all of the above into a single, natural response to the user.`;

  yield* stream(
    SYNTHESIS_MODEL,
    [
      { role: 'system', content: SYNTHESIS_SYSTEM },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 2048, temperature: 0.5 }
  );
}
