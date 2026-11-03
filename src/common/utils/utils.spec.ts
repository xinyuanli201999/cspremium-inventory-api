import { generateReference } from './reference.util';
import { slugify } from './slugify.util';

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Brand Design and Media')).toBe('brand-design-and-media');
  });
  it('drops punctuation', () => {
    expect(slugify('Keychains / Pins')).toBe('keychains-pins');
    expect(slugify('VIP-Gift Box')).toBe('vip-gift-box');
  });
  it('returns empty string for non-latin only input', () => {
    expect(slugify('ប្រភេទ')).toBe('');
  });
});

describe('generateReference', () => {
  it('has prefix, date and random suffix', () => {
    const ref = generateReference('SI', new Date(2026, 8, 29));
    expect(ref).toMatch(/^SI-20260929-[0-9A-F]{6}$/);
  });
  it('is unique across calls', () => {
    expect(generateReference('SO')).not.toBe(generateReference('SO'));
  });
});
