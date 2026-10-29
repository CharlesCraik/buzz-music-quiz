import { describe, expect, it } from 'vitest';
import { ActionInbox } from './inbox';

describe('ActionInbox', () => {
  it('accepts out-of-order seqs exactly once (simultaneous answers)', () => {
    const box = new ActionInbox();
    // Realtime pushed 10 before 9; polling later re-delivers both.
    expect(box.accept(10)).toBe(true);
    expect(box.accept(9)).toBe(true);
    expect(box.accept(10)).toBe(false);
    expect(box.accept(9)).toBe(false);
    expect(box.accept(11)).toBe(true);
  });

  it('forgets very old seqs to bound memory', () => {
    const box = new ActionInbox(3);
    [1, 2, 3, 4].forEach((s) => box.accept(s));
    expect(box.size).toBe(3);
  });
});
