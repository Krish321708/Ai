import { useCallback, useRef, useState } from 'react';
import { orchestrate } from '../lib/orchestrator';
import type { ChatMessage, OrchestrationTrace } from '../types/orchestrator';

export function useOrchestrator() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTrace, setActiveTrace] = useState<OrchestrationTrace | null>(null);
  const abortRef = useRef(false);

  const send = useCallback(async (userQuery: string) => {
    if (isRunning || !userQuery.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userQuery.trim(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsRunning(true);
    abortRef.current = false;

    // Build compact chat history for gating context
    const history = messages
      .slice(-6) // last 3 turns
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    try {
      await orchestrate(
        userQuery.trim(),
        history,
        // onUpdate — trace progress
        (trace) => {
          setActiveTrace({ ...trace });
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, trace: { ...trace }, content: trace.finalResponse }
                : m
            )
          );
        },
        // onToken — streaming synthesis tokens
        (_token) => {
          // content is already updated via onUpdate
        }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, streaming: false, content: `**Error:** ${errMsg}` }
            : m
        )
      );
    } finally {
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m))
      );
      setIsRunning(false);
    }
  }, [messages, isRunning]);

  const clear = useCallback(() => {
    setMessages([]);
    setActiveTrace(null);
  }, []);

  return { messages, isRunning, activeTrace, send, clear };
}
