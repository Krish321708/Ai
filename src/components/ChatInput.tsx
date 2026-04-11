import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { clsx } from 'clsx';

type Props = {
  onSend: (text: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
};

export function ChatInput({ onSend, onStop, isLoading, disabled }: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const t = value.trim();
    if (!t || isLoading) return;
    onSend(t);
    setValue('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = () => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 180) + 'px';
  };

  return (
    <div className="flex items-end gap-2 bg-zinc-900 border border-zinc-700 rounded-xl p-3
                    focus-within:border-amber-500/40 transition-colors
                    focus-within:shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_0_20px_rgba(245,158,11,0.04)]">
      <textarea
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        onInput={handleInput}
        disabled={disabled}
        rows={1}
        placeholder={disabled ? 'Add HF_TOKEN to .env.local to start…' : 'Ask anything — the MoA pipeline will route it…'}
        className="flex-1 bg-transparent text-zinc-200 placeholder-zinc-600 text-sm resize-none
                   focus:outline-none leading-6 min-h-[24px] max-h-[180px]"
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <button
        onClick={isLoading ? onStop : handleSend}
        disabled={disabled || (!isLoading && !value.trim())}
        className={clsx(
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all',
          isLoading ? 'bg-red-600/80 hover:bg-red-600 text-white'
            : value.trim() ? 'bg-amber-500 hover:bg-amber-400 text-black'
            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
        )}
      >
        {isLoading ? <Square size={12} /> : <ArrowUp size={14} />}
      </button>
    </div>
  );
}
