import { describe, expect, it } from 'vitest';
import { formatINR, formatINRShort, formatIndianNumber } from './format';

describe('formatINR (exact, Indian grouping)', () => {
  it('groups in the Indian lakh/crore style', () => {
    expect(formatINR(1036870)).toBe('₹10,36,870');
    expect(formatINR(19784)).toBe('₹19,784');
    expect(formatINR(12345678)).toBe('₹1,23,45,678');
  });

  it('rounds to whole rupees and handles zero/negatives', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(99.6)).toBe('₹100');
    expect(formatINR(-1036870)).toBe('-₹10,36,870');
  });
});

describe('formatIndianNumber (no symbol)', () => {
  it('groups without a currency symbol', () => {
    expect(formatIndianNumber(1036870)).toBe('10,36,870');
    expect(formatIndianNumber(184)).toBe('184');
  });
});

describe('formatINRShort (abbreviated Indian scale)', () => {
  it('keeps sub-thousand values exact', () => {
    expect(formatINRShort(0)).toBe('₹0');
    expect(formatINRShort(999)).toBe('₹999');
  });

  it('abbreviates thousands as K', () => {
    expect(formatINRShort(12345)).toBe('₹12.35 K');
    expect(formatINRShort(1000)).toBe('₹1.00 K');
  });

  it('abbreviates lakhs as L', () => {
    expect(formatINRShort(1036870)).toBe('₹10.37 L');
    expect(formatINRShort(123456)).toBe('₹1.23 L');
  });

  it('abbreviates crores as Cr', () => {
    expect(formatINRShort(12345678)).toBe('₹1.23 Cr');
    expect(formatINRShort(10000000)).toBe('₹1.00 Cr');
  });

  it('handles negatives with a leading sign', () => {
    expect(formatINRShort(-1036870)).toBe('-₹10.37 L');
    expect(formatINRShort(-19784)).toBe('-₹19.78 K');
  });
});
