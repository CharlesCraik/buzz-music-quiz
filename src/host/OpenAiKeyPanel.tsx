import { useState } from 'react';
import { DEFAULT_MODEL, getOpenAiKey, getOpenAiModel, setOpenAiKey, setOpenAiModel } from '../questions/openai';

function mask(key: string) {
  return key.length > 10 ? `${key.slice(0, 6)}…${key.slice(-4)}` : '••••';
}

/** Host-only OpenAI key entry. Stored in this browser only; never sent anywhere except api.openai.com. */
export function OpenAiKeyPanel({ onChange }: { onChange: () => void }) {
  const [key, setKey] = useState(getOpenAiKey());
  const [editing, setEditing] = useState(!getOpenAiKey());
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState(getOpenAiModel());

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
      onSubmit={(e) => {
        e.preventDefault();
        setOpenAiKey(draft);
        setOpenAiModel(model);
        setKey(getOpenAiKey());
        setDraft('');
        setEditing(false);
        onChange();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="label">OpenAI API key</span>
        <input
          className="field text-base"
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
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
      <div className="flex gap-2">
        <button className="btn-primary text-base" disabled={!draft.trim()}>
          Save key
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
