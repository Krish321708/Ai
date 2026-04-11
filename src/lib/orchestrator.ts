/**
 * orchestrator.ts — The MoA Pipeline Coordinator
 *
 * Drives the complete 5-stage pipeline:
 *   Stage 1: Gating      — decompose query into sub-tasks
 *   Stage 2: Dispatching — map sub-tasks to expert models
 *   Stage 3: Executing   — run experts in parallel
 *   Stage 4: Verifying   — reasoning core audits all outputs
 *   Stage 5: Synthesizing— synthesis agent streams final response
 *
 * Callers receive live updates via onUpdate callback.
 */

import { gate } from './gating';
import { runExperts } from './experts';
import { verify } from './verification';
import { synthesize } from './synthesis';
import type { OrchestrationTrace, PipelineStage, SubTask } from '../types/orchestrator';

type UpdateFn = (trace: OrchestrationTrace) => void;

export async function orchestrate(
  userQuery: string,
  chatHistory: string,
  onUpdate: UpdateFn,
  onToken: (token: string) => void
): Promise<OrchestrationTrace> {
  const queryId = crypto.randomUUID();
  const t0 = Date.now();

  const emit = (stage: PipelineStage, partial: Partial<OrchestrationTrace>) =>
    onUpdate({ queryId, originalQuery: userQuery, subTasks: [], finalResponse: '', stage, ...partial });

  // ── Stage 1: GATING ─────────────────────────────────────────────────────────
  emit('gating', {});
  let gatingResult: Awaited<ReturnType<typeof gate>>;
  try {
    gatingResult = await gate(userQuery, chatHistory);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit('error', { error: errMsg });
    return { queryId, originalQuery: userQuery, subTasks: [], finalResponse: '', stage: 'error', error: errMsg };
  }

  const { subTasks: initialTasks, contextSummary } = gatingResult;

  // ── Stage 2: DISPATCHING ────────────────────────────────────────────────────
  emit('dispatching', {
    contextSummary,
    subTasks: initialTasks,
  });

  await sleep(300); // brief pause so UI shows dispatch state

  // ── Stage 3: EXECUTING (parallel) ──────────────────────────────────────────
  let completedTasks: SubTask[] = [];
  try {
    completedTasks = await runExperts(initialTasks, contextSummary, (updated) => {
      emit('executing', { contextSummary, subTasks: updated });
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit('error', { subTasks: initialTasks, error: errMsg });
    return { queryId, originalQuery: userQuery, subTasks: initialTasks, finalResponse: '', stage: 'error', error: errMsg };
  }

  emit('executing', { contextSummary, subTasks: completedTasks });

  // ── Stage 4: VERIFYING ──────────────────────────────────────────────────────
  emit('verifying', { contextSummary, subTasks: completedTasks });
  const verificationNotes = await verify(completedTasks);

  emit('verifying', { contextSummary, subTasks: completedTasks, verificationNotes });

  // ── Stage 5: SYNTHESIZING (streaming) ──────────────────────────────────────
  emit('synthesizing', { contextSummary, subTasks: completedTasks, verificationNotes });

  let finalResponse = '';
  try {
    for await (const token of synthesize(userQuery, completedTasks, verificationNotes, contextSummary)) {
      finalResponse += token;
      onToken(token);
      // Keep trace updated during streaming so UI shows progress
      onUpdate({
        queryId,
        originalQuery: userQuery,
        contextSummary,
        subTasks: completedTasks,
        verificationNotes,
        finalResponse,
        stage: 'synthesizing',
      });
    }
  } catch (err) {
    // Synthesis failure — fall back to concatenating expert outputs
    console.warn('[orchestrator] Synthesis failed, using fallback concatenation', err);
    finalResponse = completedTasks
      .filter(t => t.status === 'done')
      .map(t => t.output)
      .join('\n\n');
    if (!finalResponse) finalResponse = 'Unable to generate a response. Please try again.';
  }

  const finalTrace: OrchestrationTrace = {
    queryId,
    originalQuery: userQuery,
    contextSummary,
    subTasks: completedTasks,
    verificationNotes,
    finalResponse,
    stage: 'done',
    totalDurationMs: Date.now() - t0,
  };

  onUpdate(finalTrace);
  return finalTrace;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
