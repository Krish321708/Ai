import { ExternalLink, Key } from 'lucide-react';

export function SetupBanner() {
  return (
    <div className="mx-4 mb-3 flex items-start gap-3 bg-amber-950/30 border border-amber-800/40 rounded-xl px-4 py-3">
      <Key size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-amber-200 text-xs font-medium mb-0.5">HF Token required</p>
        <p className="text-amber-400/70 text-xs">
          Add <code className="bg-amber-950/50 px-1 rounded text-amber-300">HF_TOKEN=hf_...</code> to your{' '}
          <code className="bg-amber-950/50 px-1 rounded text-amber-300">.env.local</code> file.
        </p>
      </div>
      <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer"
        className="flex-shrink-0 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300
                   bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-md transition-colors">
        Get token <ExternalLink size={9} />
      </a>
    </div>
  );
}
