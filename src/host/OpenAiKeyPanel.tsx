import { useState } from 'react';
import {
  cleanKey,
  DEFAULT_MODEL,
  getOpenAiKey,
  getOpenAiModel,
  setOpenAiKey,
  setOpenAiModel,
  testOpenAiKey,
} from '../questions/openai';

function mask(key: string) {
  return key.length > 10 ? `${key.slice(0, 6)}…${key.slice(-4)}` : '••••';
}

/** Host-only OpenAI key entry. Stored in this browser only; never sent anywhere except api.openai.com. */
export function OpenAiKeyPanel({ onChange }: { onChange: () => void }) {
  const [key, setKey] = useState(getOpenAiKey());
  const [editing, setEditing] = useState(!getOpenAiKey());
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState(getOpenAiModel());
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!editing && key) {
    return (
      <div className="chunky-sm flex flex-wrap items-center justify-between gap-2 bg-cream p-3">
        <div>
          <p className="font-display font-semibold">OpenAI key saved on this laptop</p>
          <p className="text-sm text-ink/60">
            {mask(key)} · model {model}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-base" onClick={() => setEditing(true)}>
            Change
          </button>
          <button
            className="btn-ghost text-base"
            onClick={() => {
              setOpenAiKey('');
              setKey('');
              setEditing(true);
              onChange();
            }}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="chunky-sm flex flex-col gap-2 bg-cream p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const k = cleanKey(draft);
        if (!k.startsWith('sk-')) {
          setProblem('That does not look like an OpenAI key (they start with "sk-").');
          return;
        }
        setChecking(true);
        setProblem(null);
        const err = await testOpenAiKey(k);
        setChecking(false);
        if (err) {
          setProblem(`OpenAI says: ${err}`);
          return;
        }
        setOpenAiKey(k);
        setOpenAiModel(model);
        setKey(getOpenAiKey());
        setDraft('');
        setEditing(false);
        onChange();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="label">OpenAI API key</span>
        {/* Plain text field (masked via CSS) so password managers don't autofill it. */}
        <input
          className="field text-base [-webkit-text-security:disc]"
          type="text"
          name="openai-api-key"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Model</span>
        <input
          className="field text-base"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={DEFAULT_MODEL}
          spellCheck={false}
        />
      </label>
      <p className="text-xs text-ink/60">
        Saved only in this browser on this laptop and sent only to api.openai.com. Use a key with a low spending limit.
      </p>
      {problem && <p className="chunky-sm bg-tomato p-2 text-sm font-semibold text-cream">{problem}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-base" disabled={!draft.trim() || checking}>
          {checking ? 'Checking key…' : 'Save key'}
        </button>
        {key && (
          <button type="button" className="btn-ghost text-base" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
