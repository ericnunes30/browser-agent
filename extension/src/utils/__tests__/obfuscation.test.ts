import { describe, expect, it } from 'vitest';
import { deobfuscate, obfuscate } from '../obfuscation';

describe('obfuscation', () => {
  it('round-trips plain text', () => {
    const original = 'sk-test-key-12345';
    const encoded = obfuscate(original);
    expect(encoded).not.toBe(original);
    expect(deobfuscate(encoded)).toBe(original);
  });

  it('round-trips unicode text', () => {
    const original = '🔑 chave com emojis e acentuação: áéíóú';
    const encoded = obfuscate(original);
    expect(encoded).not.toBe(original);
    expect(deobfuscate(encoded)).toBe(original);
  });

  it('round-trips an empty string', () => {
    expect(deobfuscate(obfuscate(''))).toBe('');
  });
});
