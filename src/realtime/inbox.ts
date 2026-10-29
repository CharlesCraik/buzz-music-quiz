/**
 * De-duplicates actions arriving from several channels (realtime push + polling).
 *
 * Rows can arrive out of sequence order: two phones answering at the same moment
 * get seq 9 and 10, but 10 may commit (and be pushed) first. So we must never
 * drop a row just because its seq is lower than one already seen — track every
 * seq instead.
 */
export class ActionInbox {
  private seen = new Set<number>();
  private order: number[] = [];

  constructor(private readonly keep = 2000) {}

  /** Returns true the first time a seq is offered. */
  accept(seq: number): boolean {
    if (this.seen.has(seq)) return false;
    this.seen.add(seq);
    this.order.push(seq);
    if (this.order.length > this.keep) {
      const old = this.order.splice(0, this.order.length - this.keep);
      for (const s of old) this.seen.delete(s);
    }
    return true;
  }

  get size() {
    return this.seen.size;
  }
}
