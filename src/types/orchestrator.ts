// ─── Expert Roles ────────────────────────────────────────────────────────────

export type ExpertRole =
  | 'reasoning'     // Logic, math, chain-of-thought (→ DeepSeek sub: Qwen2.5-7B)
  | 'code'          // Code synthesis & architecture (→ Kimi sub: Qwen2.5-Coder-7B)
  | 'conversational'// Prose, nuance, alignment (→ GLM-5 sub: Llama-3.2-3B)
  | 'scientific';   // Domain-specific analysis (→ AlphaFold sub: Qwen3-8B)

export const EXPERT_MODELS: Record<ExpertRole, string> = {
  reasoning:      'Qwen/Qwen2.5-7B-Instruct',          // sub for DeepSeek-R1
  code:           'Qwen/Qwen2.5-Coder-7B-Instruct',    // sub for Kimi K2.5
  conversational: 'meta-llama/Llama-3.2-3B-Instruct',  // sub for GLM-5
  scientific:     'Qwen/Qwen3-8B',                      // sub for AlphaFold/GLM-Z1
};

export const GATING_MODEL = 'Qwen/Qwen3-4B';            // sub for Gemma 27B / Llama 4
export const SYNTHESIS_MODEL = 'Qwen/Qwen2.5-7B-Instruct'; // final merge agent

export const EXPERT_LABELS: Record<ExpertRole, string> = {
  reasoning: 'Reasoning Core',
  code: 'Code Sovereign',
  conversational: 'Conversational Engine',
  scientific: 'Scientific Node',
};

export const EXPERT_COLORS: Record<ExpertRole, string> = {
  reasoning:      '#a78bfa', // violet
  code:           '#34d399', // emerald
  conversational: '#60a5fa', // blue
  scientific:     '#f97316', // orange
};

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export type PipelineStage =
  | 'idle'
  | 'gating'       // Gating model atomizes the prompt
  | 'dispatching'  // Sub-tasks mapped to experts
  | 'executing'    // Experts running in parallel
  | 'verifying'    // Cross-model audit pass
  | 'synthesizing' // Final synthesis agent
  | 'done'
  | 'error';

// ─── Sub-task ────────────────────────────────────────────────────────────────

export type SubTask = {
  id: string;
  role: ExpertRole;
  description: string;       // What this sub-task needs to do
  prompt: string;            // The actual prompt sent to the expert
  model: string;             // Which HF model handles it
  status: 'pending' | 'running' | 'done' | 'error';
  output: string;
  tokens?: number;
  durationMs?: number;
  error?: string;
};

// ─── Orchestration Result ────────────────────────────────────────────────────

export type OrchestrationTrace = {
  queryId: string;
  originalQuery: string;
  contextSummary?: string;    // RAG context injected
  subTasks: SubTask[];
  verificationNotes?: string; // Reasoning core audit output
  synthesisPrompt?: string;
  finalResponse: string;
  stage: PipelineStage;
  totalDurationMs?: number;
  error?: string;
};

// ─── Chat history ────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trace?: OrchestrationTrace;   // attached when assistant
  streaming?: boolean;
};
