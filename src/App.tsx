import { useEffect, useRef } from 'react';
import { Zap, Trash2, Cpu, Code2, MessageCircle, Microscope } from 'lucide-react';
import { useOrchestrator } from './hooks/useOrchestrator';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { EmptyState } from './components/EmptyState';
import { SetupBanner } from './components/SetupBanner';
import { EXPERT_COLORS } from './types/orchestrator';

function hasToken() {
  const t = process.env.HF_TOKEN;
  return Boolean(t && t !== 'hf_your_token_here' && t.startsWith('hf_'));
}

const STAGE_LABELS: Record<string, string> = {
  idle:         'Idle',
  gating:       '⬡ Routing query…',
  dispatching:  '⬡ Dispatching experts…',
  executing:    '⬡ Experts running in parallel…',
  verifying:    '⬡ Cross-model verification…',
  synthesizing: '⬡ Synthesizing response…',
  done:         'Done',
  error:        'Error',
};

export default function App() {
  const { messages, isRunning, activeTrace, send, clear } = useOrchestrator();
  const endRef = useRef<HTMLDivElement>(null);
  const tokenOk = hasToken();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTrace?.stage]);

  const currentStage = activeTrace?.stage ?? 'idle';

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg)]">

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Zap size={13} className="text-amber-400" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 leading-none tracking-wide"
                style={{ fontFamily: 'var(--font-display)' }}>
              Omni-Kernel
            </h1>
            <p className="text-[9px] text-zinc-600 mt-0.5 font-mono uppercase tracking-widest">
              MoA Orchestration Engine
            </p>
          </div>
        </div>

        {/* Status / expert nodes */}
        <div className="flex items-center gap-3">
          {isRunning && (
            <span className="text-[10px] text-amber-400/80 font-mono animate-pulse">
              {STAGE_LABELS[currentStage] ?? currentStage}
            </span>
          )}

          {/* Expert node indicator dots */}
          <div className="hidden sm:flex items-center gap-1.5">
            {([
              { Icon: Cpu,           color: EXPERT_COLORS.reasoning,      role: 'reasoning' },
              { Icon: Code2,         color: EXPERT_COLORS.code,           role: 'code' },
              { Icon: MessageCircle, color: EXPERT_COLORS.conversational, role: 'conversational' },
              { Icon: Microscope,    color: EXPERT_COLORS.scientific,     role: 'scientific' },
            ] as const).map(({ Icon, color, role }) => {
              const active = activeTrace?.subTasks.some(t => t.role === role && t.status === 'running');
              const done   = activeTrace?.subTasks.some(t => t.role === role && t.status === 'done');
              return (
                <div key={role}
                  title={role}
                  className="w-5 h-5 rounded flex items-center justify-center transition-all duration-300"
                  style={{
                    backgroundColor: (active || done) ? color + '25' : 'transparent',
                    border: `1px solid ${active || done ? color + '60' : '#27272a'}`,
                    boxShadow: active ? `0 0 8px ${color}50` : 'none',
                  }}>
                  <Icon size={9} style={{ color: active || done ? color : '#3f3f46' }} />
                </div>
              );
            })}
          </div>

          {messages.length > 0 && (
            <button onClick={clear}
              className="text-zinc-600 hover:text-red-400 transition-colors p-1 rounded"
              title="Clear conversation">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </header>

      {/* ── Messages ────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onSuggest={tokenOk ? send : () => {}} />
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {messages.map(msg => (
              <div key={msg.id} className="message-enter">
                <ChatMessage message={msg} />
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </main>

      {/* ── Input ───────────────────────────────────────────────── */}
      <footer className="flex-shrink-0 pb-4 pt-2">
        {!tokenOk && <SetupBanner />}
        <div className="max-w-3xl mx-auto px-4">
          <ChatInput
            onSend={send}
            onStop={() => {}}
            isLoading={isRunning}
            disabled={!tokenOk}
          />
        </div>
        <p className="text-center text-[10px] text-zinc-700 mt-2 font-mono">
          Gating · Dispatch · Parallel Experts · Verify · Synthesize
        </p>
      </footer>
    </div>
  );
}
