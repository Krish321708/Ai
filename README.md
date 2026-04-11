# Omni-Kernel — MoA Orchestration Engine

A **Mixture-of-Agents (MoA)** orchestration system that implements the full pipeline from the original spec:
decompose → dispatch → parallel expert execution → cross-model verification → synthesis.

## Architecture

```
User Query
    │
    ▼
┌─────────────────────────────────────────────┐
│  STAGE 1: GATING (Qwen3-4B)                │
│  • Prompt atomization into sub-tasks        │
│  • Expert vector mapping                    │
│  • Context injection (RAG stub)             │
└──────────────────┬──────────────────────────┘
                   │ sub-tasks[]
                   ▼
┌─────────────────────────────────────────────┐
│  STAGE 2: DISPATCH                          │
│  Routes each sub-task to the right expert  │
└──────┬──────┬──────┬───────────────────────┘
       │      │      │
  ┌────▼──┐ ┌─▼────┐ ┌▼──────────┐ ┌──────────────┐
  │ REASON│ │ CODE │ │CONVERS.   │ │ SCIENTIFIC   │
  │ ING   │ │      │ │ENGINE     │ │ NODE         │
  │Qwen2.5│ │Qwen  │ │Llama-3.2- │ │Qwen3-8B      │
  │-7B    │ │Coder │ │3B-Instruct│ │              │
  └────┬──┘ └──┬───┘ └──┬────────┘ └──────┬───────┘
       └───────┴─────────┴──────────────────┘
                   │ parallel outputs
                   ▼
┌─────────────────────────────────────────────┐
│  STAGE 4: CROSS-MODEL VERIFICATION          │
│  Reasoning Core audits all expert outputs  │
│  for consistency, correctness, gaps         │
└──────────────────┬──────────────────────────┘
                   │ verified outputs + notes
                   ▼
┌─────────────────────────────────────────────┐
│  STAGE 5: SYNTHESIS (Qwen2.5-7B, streaming)│
│  Weaves all outputs into one cohesive       │
│  response — consistent persona & depth     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
            Final Response
```

## Model Mapping (mid-tier substitutes)

| Spec Target              | Substitute Used                    | Role              |
|--------------------------|------------------------------------|-------------------|
| Gemma 3 27B / Llama 4    | `Qwen/Qwen3-4B`                    | Gating / Router   |
| DeepSeek-V4 R1 (1T MoE)  | `Qwen/Qwen2.5-7B-Instruct`        | Reasoning Core    |
| Kimi K2.5 (1M ctx)       | `Qwen/Qwen2.5-Coder-7B-Instruct`  | Code Sovereign    |
| GLM-5 / Llama 4 Behemoth | `meta-llama/Llama-3.2-3B-Instruct`| Conversational    |
| AlphaFold 3 / GLM-Z1     | `Qwen/Qwen3-8B`                   | Scientific Node   |
| Synthesis Agent          | `Qwen/Qwen2.5-7B-Instruct`        | Final Merge       |

All models run on the **Hugging Face Inference API** — no local GPU needed for testing.

## Run Locally

```bash
npm install

# Create .env.local with your free HF token
# Get one at: https://huggingface.co/settings/tokens
echo "HF_TOKEN=hf_your_token_here" > .env.local

npm run dev
# → http://localhost:3000
```

## What you'll see in the UI

- **Pipeline progress bar** — 5 stages, live updates
- **Expert node indicators** — glow when their model is executing
- **Expandable trace panel** per message showing:
  - Which sub-tasks were created by the gating model
  - Each expert's output (preview)
  - Verification audit notes
  - Total pipeline duration

## File Structure

```
src/
├── types/orchestrator.ts   ← All shared types, model config, role definitions
├── lib/
│   ├── hf.ts               ← HF Inference API client (streaming + non-streaming)
│   ├── gating.ts           ← Stage 1: Semantic decomposition & dispatch
│   ├── experts.ts          ← Stage 3: Parallel expert execution
│   ├── verification.ts     ← Stage 4: Cross-model audit
│   ├── synthesis.ts        ← Stage 5: Streaming synthesis agent
│   └── orchestrator.ts     ← Pipeline coordinator (drives all 5 stages)
├── hooks/
│   └── useOrchestrator.ts  ← React state wrapper for the pipeline
└── components/
    ├── PipelineTrace.tsx   ← Live pipeline visualizer
    ├── ChatMessage.tsx     ← Message + expandable trace
    ├── ChatInput.tsx       ← Input with send/stop
    ├── EmptyState.tsx      ← Welcome screen
    └── SetupBanner.tsx     ← HF token prompt
```
