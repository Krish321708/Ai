import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, User, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { PipelineTrace } from './PipelineTrace';
import type { ChatMessage as ChatMessageType } from '../types/orchestrator';

type Props = { message: ChatMessageType };

export function ChatMessage({ message }: Props) {
  const [traceOpen, setTraceOpen] = useState(false);
  const isUser = message.role === 'user';
  const hasTrace = Boolean(message.trace && message.trace.subTasks.length > 0);

  return (
    <div className={clsx('flex gap-3 px-4 py-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={clsx(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
        isUser
          ? 'bg-amber-500/15 border border-amber-500/30'
          : 'bg-zinc-800 border border-zinc-700'
      )}>
        {isUser
          ? <User size={13} className="text-amber-400" />
          : <Bot size={13} className="text-zinc-400" />}
      </div>

      {/* Content */}
      <div className={clsx('max-w-[80%] space-y-2', isUser ? 'items-end' : 'items-start')}>
        {/* Message bubble */}
        <div className={clsx(
          'rounded-xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-50'
            : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-200'
        )}>
          <div className="prose prose-invert prose-sm max-w-none
                          prose-p:my-1 prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-700
                          prose-code:text-amber-300 prose-code:bg-zinc-900/80 prose-code:px-1
                          prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown>{message.content || (message.streaming ? ' ' : '(empty)')}</ReactMarkdown>
            {message.streaming && (
              <span className="inline-block w-1.5 h-3.5 bg-amber-400 ml-0.5 rounded-sm align-middle animate-pulse" />
            )}
          </div>
        </div>

        {/* Pipeline trace toggle */}
        {!isUser && hasTrace && (
          <div className="w-full">
            <button
              onClick={() => setTraceOpen(o => !o)}
              className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors group"
            >
              {traceOpen
                ? <ChevronDown size={10} className="group-hover:text-amber-500 transition-colors" />
                : <ChevronRight size={10} className="group-hover:text-amber-500 transition-colors" />
              }
              <span className="font-mono uppercase tracking-wider">
                {traceOpen ? 'Hide' : 'Show'} pipeline trace
                {message.trace?.subTasks.length
                  ? ` · ${message.trace.subTasks.length} expert${message.trace.subTasks.length > 1 ? 's' : ''}`
                  : ''}
                {message.trace?.totalDurationMs
                  ? ` · ${(message.trace.totalDurationMs / 1000).toFixed(1)}s`
                  : ''}
              </span>
            </button>

            {traceOpen && message.trace && (
              <div className="mt-2">
                <PipelineTrace trace={message.trace} />
              </div>
            )}
          </div>
        )}

        {/* Live trace during streaming */}
        {!isUser && message.streaming && message.trace && message.trace.stage !== 'synthesizing' && (
          <div className="w-full">
            <PipelineTrace trace={message.trace} />
          </div>
        )}
      </div>
    </div>
  );
}
