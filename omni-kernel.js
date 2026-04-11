/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║           OMNI-KERNEL ORCHESTRATION ENGINE v1.1           ║
 * ║  Mixture-of-Agents · Task Scheduling · Fact Verification  ║
 * ╚═══════════════════════════════════════════════════════════╝
 *
 * Pipeline stages:
 *   1. INTAKE      — spell-check, intent parsing, task extraction
 *   2. SCHEDULER   — estimate time, sort shortest-first, background queue
 *   3. DISPATCH    — route each task to the right expert model in parallel
 *   4. FACT CHECK  — verify factual claims, flag uncertainty honestly
 *   5. SYNTHESIS   — stream one cohesive final response
 *
 * Fixes in v1.1 vs v1.0:
 *   - Retry on 429 rate-limit with exponential backoff (all API calls)
 *   - hfStream generator now closes reader in ALL exit paths (return/throw)
 *   - Robust JSON extraction (handles markdown fences, leading text)
 *   - buildSchedule guards against null/undefined tasks array
 *   - chatHistory no longer sent twice to experts
 *   - executing stage properly marked done in pipeline
 *   - backgroundQueue reset on init (no cross-session state leak)
 *   - emit() wrapped in try/catch so UI errors don't crash pipeline
 *   - All switch cases in index.html event handler use blocks (no strict-mode crash)
 */

'use strict';

// ─── Model Registry ──────────────────────────────────────────────────────────

const MODELS = {
  intake:    'Qwen/Qwen2.5-1.5B-Instruct',
  reasoning: 'Qwen/Qwen2.5-7B-Instruct',
  code:      'Qwen/Qwen2.5-Coder-7B-Instruct',
  creative:  'meta-llama/Llama-3.2-3B-Instruct',
  factcheck: 'Qwen/Qwen2.5-3B-Instruct',
  synthesis: 'Qwen/Qwen2.5-7B-Instruct',
};

const BASE_TIME_ESTIMATES = {
  spelling: 2, question: 8, story: 45, code: 60,
  analysis: 30, summary: 15, translation: 10,
  math: 12, research: 90, general: 10,
};

const BACKGROUND_THRESHOLD_SECONDS = 300;
const HF_BASE = 'https://api-inference.huggingface.co/v1';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

// ─── State ────────────────────────────────────────────────────────────────────

let _token = null;
let _eventBus = null;
let _backgroundQueue = [];
let _backgroundWorkerRunning = false;

// ─── Public API ───────────────────────────────────────────────────────────────

function OmniKernel_init(hfToken, onEvent) {
  _token = hfToken;
  _eventBus = onEvent;
  _backgroundQueue = [];
  _backgroundWorkerRunning = false;
  emit('kernel:ready', { models: MODELS, version: '1.1.0' });
}

/**
 * Run rawInput through the full 5-stage pipeline.
 * chatHistory must NOT include the current user message — pass only prior turns.
 */
async function OmniKernel_process(rawInput, chatHistory = []) {
  const runId = crypto.randomUUID();
  emit('pipeline:start', { runId, input: rawInput });

  try {
    // ── 1. INTAKE ────────────────────────────────────────────────────────────
    emit('stage', { runId, stage: 'intake', status: 'running', label: 'Parsing input…' });
    const intake = await runIntake(rawInput, chatHistory);
    emit('stage', { runId, stage: 'intake', status: 'done', data: intake });

    // ── 2. SCHEDULING ────────────────────────────────────────────────────────
    emit('stage', { runId, stage: 'scheduling', status: 'running', label: 'Scheduling tasks…' });
    const schedule = buildSchedule(intake.tasks || []);
    emit('stage', { runId, stage: 'scheduling', status: 'done', data: schedule });

    const fgTasks = schedule.foreground;
    const bgTasks = schedule.background;

    // Edge case: if everything got pushed to background, force one foreground
    if (fgTasks.length === 0 && bgTasks.length > 0) {
      fgTasks.push(bgTasks.shift());
    }

    if (bgTasks.length > 0) {
      emit('background:queued', { runId, tasks: bgTasks.map(t => t.type) });
      bgTasks.forEach(t => queueBackground(t, intake.corrected, chatHistory, runId));
    }

    // ── 3. EXECUTE FOREGROUND TASKS ──────────────────────────────────────────
    // Build full context once (prior history + current user message)
    const fullContext = [
      ...chatHistory,
      { role: 'user', content: intake.corrected },
    ];

    const taskResults = [];
    for (const task of fgTasks) {
      emit('task:start', { runId, taskId: task.id, type: task.type, estimatedSeconds: task.estimatedSeconds });
      const result = await executeTask(task, fullContext);
      taskResults.push(result);
      emit('task:done', { runId, taskId: task.id, type: task.type });
    }
    emit('stage', { runId, stage: 'executing', status: 'done' });

    // ── 4. FACT CHECK ────────────────────────────────────────────────────────
    emit('stage', { runId, stage: 'factcheck', status: 'running', label: 'Verifying facts…' });
    const factChecked = await factCheckResults(taskResults, intake.corrected);
    emit('stage', { runId, stage: 'factcheck', status: 'done', data: factChecked });

    // ── 5. SYNTHESIS (streaming) ─────────────────────────────────────────────
    emit('stage', { runId, stage: 'synthesis', status: 'running', label: 'Synthesizing…' });
    emit('response:start', { runId });
    await synthesizeAndStream(intake.corrected, taskResults, factChecked, chatHistory, runId);

    emit('pipeline:done', { runId, backgroundPending: bgTasks.length });

  } catch (err) {
    console.error('[OmniKernel] Pipeline error:', err);
    emit('pipeline:error', { runId, error: err.message || String(err) });
  }
}

function OmniKernel_getBackgroundStatus() {
  return _backgroundQueue.map(i => ({
    id: i.task.id, type: i.task.type,
    status: i.status, progress: i.progress || 0,
  }));
}

// ─── Stage 1: Intake ─────────────────────────────────────────────────────────

async function runIntake(rawInput, chatHistory) {
  const historySnippet = chatHistory.slice(-4)
    .map(m => `${m.role}: ${m.content.slice(0, 120)}`).join('\n');

  const safeInput = rawInput.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const prompt = `You are an intake processor for an AI orchestration system.
Return ONLY valid JSON — no markdown fences, no explanation, just the JSON object.

Steps:
1. Fix spelling/grammar in the input
2. Identify ALL distinct tasks the user wants done
3. Classify each task type: question | story | code | analysis | summary | translation | math | research | general
4. Set needsFactCheck=true only for tasks with real-world facts/statistics/science claims

Input: "${safeInput}"
${historySnippet ? `\nRecent conversation:\n${historySnippet}` : ''}

Return this exact JSON structure:
{
  "corrected": "spell-corrected version of input",
  "corrections": ["correction1", "correction2"],
  "tasks": [
    {
      "id": "task_1",
      "type": "question",
      "description": "brief description",
      "prompt": "exact prompt to send to expert",
      "needsFactCheck": false,
      "complexity": "low"
    }
  ],
  "intent": "one sentence summary"
}`;

  try {
    const raw = await hfComplete(
      MODELS.intake,
      [
        { role: 'system', content: 'Output only valid JSON. No markdown. No preamble. Only the JSON object.' },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 800, temperature: 0.05 },
    );

    const parsed = JSON.parse(extractJSON(raw));
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) throw new Error('No tasks');

    parsed.tasks = parsed.tasks.map((t, i) => ({
      id:             t.id             || `task_${i + 1}`,
      type:           t.type           || 'general',
      description:    t.description    || rawInput,
      prompt:         t.prompt         || rawInput,
      needsFactCheck: Boolean(t.needsFactCheck),
      complexity:     t.complexity     || 'low',
    }));

    return {
      corrected:   parsed.corrected   || rawInput,
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
      tasks:       parsed.tasks,
      intent:      parsed.intent      || rawInput,
    };
  } catch (err) {
    console.warn('[OmniKernel] Intake fallback triggered:', err.message);
    return {
      corrected: rawInput, corrections: [],
      tasks: [{ id: 'task_1', type: 'general', description: rawInput, prompt: rawInput, needsFactCheck: false, complexity: 'low' }],
      intent: rawInput,
    };
  }
}

function extractJSON(raw) {
  let s = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = s.indexOf('{');
  const end   = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object found in response');
  return s.slice(start, end + 1);
}

// ─── Stage 2: Scheduling ─────────────────────────────────────────────────────

function buildSchedule(tasks) {
  if (!tasks || tasks.length === 0) return { foreground: [], background: [], all: [] };
  const enriched = tasks
    .map(t => ({ ...t, estimatedSeconds: estimateTime(t) }))
    .sort((a, b) => a.estimatedSeconds - b.estimatedSeconds);
  const foreground = enriched.filter(t => t.estimatedSeconds <= BACKGROUND_THRESHOLD_SECONDS);
  const background = enriched.filter(t => t.estimatedSeconds >  BACKGROUND_THRESHOLD_SECONDS);
  return { foreground, background, all: enriched };
}

function estimateTime(task) {
  const base = BASE_TIME_ESTIMATES[task.type] ?? BASE_TIME_ESTIMATES.general;
  const mult = { low: 1, medium: 2, high: 4 }[task.complexity] ?? 1;
  return base * mult;
}

// ─── Stage 3: Expert Execution ───────────────────────────────────────────────

const EXPERT_SYSTEMS = {
  question:    'You are a knowledgeable assistant. Answer clearly and accurately. If uncertain, say "I\'m not certain about this, but…" — never fabricate.',
  story:       'You are a creative writer. Write engaging, vivid, well-structured prose. Be imaginative and original.',
  code:        'You are a senior software engineer. Write clean, production-grade code with comments. Handle edge cases. After the code, briefly explain key design decisions.',
  analysis:    'You are an analytical expert. Break down topics systematically with evidence-based reasoning. Flag assumptions explicitly.',
  summary:     'You are a precise summarizer. Extract key points. Preserve important nuance. Be concise without losing substance.',
  translation: 'You are a professional translator. Translate accurately, preserving tone and meaning. Note idiomatic nuances.',
  math:        'You are a mathematics expert. Show all working step by step. Verify your answer at the end.',
  research:    'You are a research assistant. Provide comprehensive, accurate information. Flag uncertainty and ongoing debates.',
  general:     'You are a helpful, honest assistant. Be clear, accurate, and direct. If unsure about something, say so explicitly.',
};

function modelForTask(task) {
  const map = { code: 'code', story: 'creative', math: 'reasoning', analysis: 'reasoning', research: 'reasoning', question: 'reasoning' };
  return MODELS[map[task.type] || 'reasoning'];
}

async function executeTask(task, fullContext) {
  const model  = modelForTask(task);
  const system = EXPERT_SYSTEMS[task.type] ?? EXPERT_SYSTEMS.general;

  // Build messages: system + recent context (no double-sending of user message)
  const messages = [
    { role: 'system', content: system },
    ...fullContext.slice(-6),
  ];

  // If task prompt differs from the last user message, append it
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== task.prompt) {
    if (task.prompt !== fullContext[fullContext.length - 1]?.content) {
      messages.push({ role: 'user', content: task.prompt });
    }
  }

  const temp = task.type === 'story' ? 0.8 : task.type === 'code' ? 0.15 : task.type === 'math' ? 0.1 : 0.4;
  const maxTok = (task.type === 'story' || task.type === 'code') ? 1500 : 1200;

  try {
    const output = await hfComplete(model, messages, { maxTokens: maxTok, temperature: temp });
    return { taskId: task.id, type: task.type, model, output, status: 'done', needsFactCheck: task.needsFactCheck };
  } catch (err) {
    console.error(`[OmniKernel] Task ${task.id} failed:`, err.message);
    return { taskId: task.id, type: task.type, model, output: '', status: 'error', error: err.message, needsFactCheck: false };
  }
}

// ─── Stage 4: Fact Check ─────────────────────────────────────────────────────

async function factCheckResults(taskResults, originalQuery) {
  const toCheck = taskResults.filter(r => r.needsFactCheck && r.output && r.status === 'done');
  if (toCheck.length === 0) return { verified: true, notes: [], allPassed: true, overallConfidence: 'high' };

  const combined = toCheck.map(r => `[${r.type.toUpperCase()}]\n${r.output.slice(0, 600)}`).join('\n\n---\n\n');
  const safeQ    = originalQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const prompt = `Fact-check these AI outputs. For each notable claim: VERIFIED | UNCERTAIN | INCORRECT.
Original question: "${safeQ}"
Content:\n${combined}\n
Return ONLY this JSON:
{"allPassed":true,"notes":[{"claim":"...","status":"VERIFIED","note":"..."}],"overallConfidence":"high"}`;

  try {
    const raw    = await hfComplete(MODELS.factcheck, [
      { role: 'system', content: 'Precise fact-checker. Return only valid JSON, no markdown.' },
      { role: 'user',   content: prompt },
    ], { maxTokens: 500, temperature: 0.1 });
    const parsed = JSON.parse(extractJSON(raw));
    return {
      allPassed:         parsed.allPassed ?? true,
      notes:             Array.isArray(parsed.notes) ? parsed.notes : [],
      overallConfidence: parsed.overallConfidence ?? 'medium',
    };
  } catch (err) {
    console.warn('[OmniKernel] Fact check parse failed:', err.message);
    return { verified: true, notes: [], allPassed: true, overallConfidence: 'medium' };
  }
}

// ─── Stage 5: Synthesis ───────────────────────────────────────────────────────

async function synthesizeAndStream(originalQuery, taskResults, factCheck, chatHistory, runId) {
  const success  = taskResults.filter(r => r.status === 'done' && r.output);
  const failed   = taskResults.filter(r => r.status === 'error');
  const outputs  = success.map(r => `### ${r.type.toUpperCase()}\n${r.output}`).join('\n\n---\n\n');
  const uncerts  = (factCheck.notes || []).filter(n => n.status !== 'VERIFIED').map(n => `- ${n.claim}: ${n.note}`).join('\n');

  const system = `You are the synthesis layer of a Mixture-of-Agents pipeline.
Weave expert outputs into one natural, cohesive, well-structured response.
Rules:
- Never mention agents, pipeline, or internal processing
- Weave uncertainty caveats naturally if flagged (e.g. "I should note I'm not fully certain about...")
- Consistent tone throughout
- Use markdown (code blocks with language tag, headers, lists) where it helps
- Start immediately — no preamble like "Here is..." or "Certainly..."`;

  const userMsg = `Original request: "${originalQuery}"

Expert outputs:
${outputs || '(No expert outputs — respond directly)'}
${uncerts  ? `\nUncertainty flags:\n${uncerts}` : ''}
${failed.length ? `\nNote: ${failed.map(t => t.type).join(', ')} task(s) failed — handle gracefully.` : ''}`;

  try {
    for await (const chunk of hfStream(
      MODELS.synthesis,
      [
        { role: 'system', content: system },
        ...chatHistory.slice(-4),
        { role: 'user', content: userMsg },
      ],
      { maxTokens: 2048, temperature: 0.5 },
    )) {
      emit('response:token', { runId, token: chunk });
    }
    emit('response:done', { runId });
  } catch (err) {
    console.error('[OmniKernel] Synthesis failed:', err.message);
    const fallback = success.map(r => r.output).join('\n\n') || 'Unable to generate a response. Please try again.';
    emit('response:token', { runId, token: fallback });
    emit('response:done', { runId });
  }
}

// ─── Background Queue ─────────────────────────────────────────────────────────

function queueBackground(task, correctedInput, chatHistory, parentRunId) {
  _backgroundQueue.push({ task, correctedInput, chatHistory, parentRunId, status: 'queued', progress: 0, result: null });
  if (!_backgroundWorkerRunning) runBackgroundWorker();
}

async function runBackgroundWorker() {
  _backgroundWorkerRunning = true;
  while (_backgroundQueue.some(i => i.status === 'queued')) {
    const item = _backgroundQueue.find(i => i.status === 'queued');
    if (!item) break;
    item.status = 'running';
    emit('background:taskStart', { taskId: item.task.id, type: item.task.type });
    try {
      const ctx    = [...item.chatHistory, { role: 'user', content: item.correctedInput }];
      const result = await executeTask(item.task, ctx);
      item.result  = result;
      item.status  = 'done';
      emit('background:taskDone', { taskId: item.task.id, type: item.task.type, result: result.output });
    } catch (err) {
      item.status = 'error';
      emit('background:taskError', { taskId: item.task.id, error: err.message });
    }
  }
  _backgroundWorkerRunning = false;
}

// ─── HF API ───────────────────────────────────────────────────────────────────

async function hfComplete(model, messages, opts = {}, attempt = 0) {
  if (!_token) throw new Error('HF token not set. Call OmniKernel.init() first.');
  let res;
  try {
    res = await fetch(`${HF_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 1024, temperature: opts.temperature ?? 0.4, stream: false }),
    });
  } catch (e) { throw new Error(`Network error [${model.split('/').pop()}]: ${e.message}`); }

  if (res.status === 429 && attempt < MAX_RETRIES) {
    await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    return hfComplete(model, messages, opts, attempt + 1);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HF ${res.status} [${model.split('/').pop()}]: ${txt.slice(0, 200)}`);
  }
  const data    = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null) throw new Error(`Empty response from ${model.split('/').pop()}`);
  return content;
}

async function* hfStream(model, messages, opts = {}, attempt = 0) {
  if (!_token) throw new Error('HF token not set.');
  let res;
  try {
    res = await fetch(`${HF_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 2048, temperature: opts.temperature ?? 0.5, stream: true }),
    });
  } catch (e) { throw new Error(`Network error streaming [${model.split('/').pop()}]: ${e.message}`); }

  if (res.status === 429 && attempt < MAX_RETRIES) {
    await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    yield* hfStream(model, messages, opts, attempt + 1);
    return;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HF stream ${res.status} [${model.split('/').pop()}]: ${txt.slice(0, 200)}`);
  }
  if (!res.body) throw new Error('No response body from streaming API');

  const reader = res.body.getReader();
  const dec    = new TextDecoder();
  let   buf    = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') return;
        try {
          const p = JSON.parse(d);
          const c = p.choices?.[0]?.delta?.content;
          if (c) yield c;
        } catch { /* malformed chunk */ }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function emit(type, payload = {}) {
  if (typeof _eventBus === 'function') {
    try { _eventBus({ type, payload }); }
    catch (e) { console.error('[OmniKernel] emit error:', e); }
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

window.OmniKernel = {
  init:                OmniKernel_init,
  process:             OmniKernel_process,
  getBackgroundStatus: OmniKernel_getBackgroundStatus,
  MODELS,
  VERSION: '1.1.0',
};
