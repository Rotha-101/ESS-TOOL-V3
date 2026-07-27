// LEB128-style varint + zigzag primitives shared by the encoder and decoder.
//
// Arithmetic (not bitwise) shifts on purpose: JS bitwise operators truncate to
// 32 bits signed, and a first-sample delta on a 100 MW plant quantized to 1 kW
// steps already reaches 2e5 — safe today but one precision change away from
// silently wrapping.

/** Growable byte buffer. Avoids building a multi-million element JS number
 *  array for a payload we already know is ~2.5 MB before compression. */
export class ByteWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialCapacity = 1 << 16) {
    this.buf = new Uint8Array(initialCapacity);
  }

  private grow(needed: number) {
    let cap = this.buf.length;
    while (cap < this.len + needed) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(b: number) {
    if (this.len + 1 > this.buf.length) this.grow(1);
    this.buf[this.len++] = b;
  }

  varint(n: number) {
    if (this.len + 10 > this.buf.length) this.grow(10);
    while (n >= 0x80) {
      this.buf[this.len++] = (n % 128) | 0x80;
      n = Math.floor(n / 128);
    }
    this.buf[this.len++] = n;
  }

  /** Copy of exactly the written bytes. */
  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len);
  }

  get length() {
    return this.len;
  }
}

export class ByteReader {
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {}

  get offset() {
    return this.pos;
  }

  get exhausted() {
    return this.pos >= this.buf.length;
  }

  peek(): number {
    return this.buf[this.pos];
  }

  byte(): number {
    return this.buf[this.pos++];
  }

  varint(): number {
    let result = 0;
    let scale = 1;
    let b: number;
    do {
      b = this.buf[this.pos++];
      result += (b & 0x7f) * scale;
      scale *= 128;
    } while (b & 0x80);
    return result;
  }
}

/** Map signed -> unsigned so small negative deltas stay short. */
export const zigzagEncode = (n: number): number => (n < 0 ? -2 * n - 1 : 2 * n);

export const zigzagDecode = (n: number): number => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);
