import { Zap, Cpu, Code2, MessageCircle, Microscope } from 'lucide-react';
import { EXPERT_COLORS } from '../types/orchestrator';

const SUGGESTIONS = [
  { text: 'Explain and implement a Red-Black Tree in Python', hint: 'reasoning + code' },
  { text: 'Analyze the statistical significance of A/B test results with p=0.03', hint: 'scientific + reasoning' },
  { text: 'Write a technical blog post explaining how transformers work', hint: 'conversational + reasoning' },
  { text: 'Build a REST API with auth, rate limiting, and explain each design choice', hint: 'code + conversational' },
  { text: 'Prove why P≠NP is hard and what it means practically for software engineers', hint: 'reasoning + conversational' },
  { text: 'Design a database schema for a multi-tenant SaaS and write the migration SQL', hint: 'code + reasoning' },
];

type Props = { onSuggest: (text: string) => void };

export function EmptyState({ onSuggest }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 select-none">
      {/* Logo */}
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <Zap size={28} className="text-amber-400" fill="currentColor" />
        </div>
        <div className="absolute -inset-4 rounded-3xl bg-amber-500/5 blur-2xl -z-10" />
      </div>

      <h1 className="text-2xl font-bold text-zinc-100 tracking-tight mb-1"
          style={{ fontFamily: 'var(--font-display)' }}>
        Omni-Kernel
      </h1>
      <p className="text-zinc-600 text-xs font-mono mb-2">MoA Orchestration Engine</p>
      <p className="text-zinc-500 text-sm text-center max-w-sm mb-8 leading-relaxed">
        Your query is routed through a 5-stage pipeline: decomposed, dispatched to specialist experts, verified, then synthesized.
      </p>

      {/* Expert node legend */}
      <div className="flex items-center gap-4 mb-8 flex-wrap justify-center">
        {([
          { Icon: Cpu,           label: 'Reasoning',      role: 'reasoning' },
          { Icon: Code2,         label: 'Code',           role: 'code' },
          { Icon: MessageCircle, label: 'Conversational', role: 'conversational' },
          { Icon: Microscope,    label: 'Scientific',     role: 'scientific' },
        ] as const).map(({ Icon, label, role }) => (
          <div key={role} className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center"
              style={{ backgroundColor: EXPERT_COLORS[role] + '20', border: `1px solid ${EXPERT_COLORS[role]}40` }}>
              <Icon size={10} style={{ color: EXPERT_COLORS[role] }} />
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">{label}</span>
          </div>
        ))}
      </div>

      {/* Suggestion chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
        {SUGGESTIONS.map(s => (
          <button
            key={s.text}
            onClick={() => onSuggest(s.text)}
            className="text-left bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700
                       rounded-lg px-3.5 py-2.5 transition-all group"
          >
            <p className="text-xs text-zinc-300 group-hover:text-zinc-100 transition-colors mb-1 leading-snug">{s.text}</p>
            <p className="text-[9px] text-zinc-700 font-mono group-hover:text-amber-600/60 transition-colors">{s.hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
