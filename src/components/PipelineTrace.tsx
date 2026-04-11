import { clsx } from 'clsx';
import {
  CheckCircle2, Circle, Clock, AlertCircle,
  Cpu, Code2, MessageCircle, Microscope,
  GitMerge, ShieldCheck, Zap, Loader2
} from 'lucide-react';
import type { OrchestrationTrace, SubTask, ExpertRole, PipelineStage } from '../types/orchestrator';
import { EXPERT_LABELS, EXPERT_COLORS } from '../types/orchestrator';

// ─── Stage definitions ────────────────────────────────────────────────────────

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: 'gating',       label: 'Gating' },
  { id: 'dispatching',  label: 'Dispatch' },
  { id: 'executing',    label: 'Experts' },
  { id: 'verifying',    label: 'Verify' },
  { id: 'synthesizing', label: 'Synthesize' },
  { id: 'done',         label: 'Done' },
];

const STAGE_ORDER: PipelineStage[] = STAGES.map(s => s.id);

function stageIndex(s: PipelineStage) {
  return STAGE_ORDER.indexOf(s);
}

// ─── Expert role icons ───────────────────────────────────────────────────────

const ROLE_ICONS: Record<ExpertRole, React.ElementType> = {
  reasoning:      Cpu,
  code:           Code2,
  conversational: MessageCircle,
  scientific:     Microscope,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StageBar({ current }: { current: PipelineStage }) {
  const currentIdx = stageIndex(current);
  return (
    <div className="flex items-center gap-0.5 mb-3">
      {STAGES.map((stage, i) => {
        const isPast    = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isFuture  = i > currentIdx;
        return (
          <div key={stage.id} className="flex items-center gap-0.5 flex-1">
            <div className={clsx(
              'flex-1 h-1 rounded-full transition-all duration-500',
              isPast    && 'bg-amber-500',
              isCurrent && 'bg-amber-400 animate-pulse',
              isFuture  && 'bg-zinc-800',
            )} />
            {i < STAGES.length - 1 && (
              <div className={clsx(
                'w-1 h-1 rounded-full flex-shrink-0',
                isPast ? 'bg-amber-500' : 'bg-zinc-800'
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StageLabel({ current }: { current: PipelineStage }) {
  return (
    <div className="flex justify-between mb-2">
      {STAGES.map((stage, i) => {
        const currentIdx = stageIndex(current);
        const isPast    = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <span
            key={stage.id}
            className={clsx(
              'text-[9px] font-mono transition-colors',
              isPast    && 'text-amber-600',
              isCurrent && 'text-amber-400 font-bold',
              !isPast && !isCurrent && 'text-zinc-700'
            )}
          >
            {stage.label}
          </span>
        );
      })}
    </div>
  );
}

function SubTaskCard({ task }: { task: SubTask }) {
  const Icon = ROLE_ICONS[task.role];
  const color = EXPERT_COLORS[task.role];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 space-y-1.5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '20', border: `1px solid ${color}40` }}>
          <Icon size={10} style={{ color }} />
        </div>
        <span className="text-[10px] font-semibold flex-1 truncate" style={{ color }}>
          {EXPERT_LABELS[task.role]}
        </span>
        <StatusIcon status={task.status} />
      </div>

      {/* Description */}
      <p className="text-[10px] text-zinc-500 leading-relaxed pl-7">{task.description}</p>

      {/* Model */}
      <p className="text-[9px] text-zinc-700 pl-7 font-mono truncate">
        {task.model.split('/')[1]}
        {task.durationMs ? ` · ${(task.durationMs / 1000).toFixed(1)}s` : ''}
      </p>

      {/* Output preview */}
      {task.output && (
        <div className="pl-7 mt-1">
          <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3 font-mono bg-zinc-950 rounded p-1.5 border border-zinc-800">
            {task.output.slice(0, 200)}{task.output.length > 200 ? '…' : ''}
          </p>
        </div>
      )}

      {task.error && (
        <p className="text-[10px] text-red-400 pl-7 flex items-center gap-1">
          <AlertCircle size={9} /> {task.error.slice(0, 100)}
        </p>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: SubTask['status'] }) {
  if (status === 'running') return <Loader2 size={10} className="text-amber-400 animate-spin" />;
  if (status === 'done')    return <CheckCircle2 size={10} className="text-emerald-500" />;
  if (status === 'error')   return <AlertCircle size={10} className="text-red-500" />;
  return <Circle size={10} className="text-zinc-700" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  trace: OrchestrationTrace;
};

export function PipelineTrace({ trace }: Props) {
  const { stage, subTasks, contextSummary, verificationNotes, totalDurationMs } = trace;
  const isActive = stage !== 'done' && stage !== 'error' && stage !== 'idle';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <Zap size={11} className="text-amber-400" />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest font-mono">
          MoA Pipeline
        </span>
        {isActive && <Loader2 size={10} className="text-amber-400 animate-spin ml-auto" />}
        {stage === 'done' && (
          <span className="ml-auto text-[9px] text-zinc-600 font-mono flex items-center gap-1">
            <Clock size={8} /> {totalDurationMs ? `${(totalDurationMs / 1000).toFixed(1)}s` : ''}
          </span>
        )}
        {stage === 'error' && (
          <AlertCircle size={10} className="text-red-500 ml-auto" />
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Stage progress bar */}
        <div>
          <StageLabel current={stage} />
          <StageBar current={stage} />
        </div>

        {/* Context summary */}
        {contextSummary && (
          <div className="flex items-start gap-2 text-[10px] text-zinc-600">
            <span className="text-zinc-700 font-mono flex-shrink-0">CTX</span>
            <span className="italic">{contextSummary}</span>
          </div>
        )}

        {/* Sub-tasks */}
        {subTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] text-zinc-700 uppercase tracking-wider font-mono">
              Expert Nodes ({subTasks.length})
            </p>
            {subTasks.map(task => (
              <SubTaskCard key={task.id} task={task} />
            ))}
          </div>
        )}

        {/* Verification */}
        {verificationNotes && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ShieldCheck size={10} className="text-violet-400" />
              <span className="text-[9px] text-violet-400 uppercase tracking-wider font-mono font-bold">
                Verification Audit
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
              {verificationNotes}
            </p>
          </div>
        )}

        {/* Synthesis */}
        {(stage === 'synthesizing' || stage === 'done') && (
          <div className="flex items-center gap-1.5">
            <GitMerge size={10} className="text-amber-500" />
            <span className="text-[9px] text-amber-500/70 font-mono uppercase tracking-wider">
              {stage === 'synthesizing' ? 'Synthesizing response…' : 'Synthesis complete'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
