import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateProgress } from '@/services/supabase/DboardingService';

// Feature: employee-self-service-hub, Property 6: Deboarding Progress Calculation
//
// For any deboarding pipeline entry at stage s (1-indexed out of 7 total stages),
// the progress percentage equals round((s / 7) × 100), always yielding a value
// between 1 and 100 inclusive.
//
// ∀ entry at stage s (1-indexed):
//   progress = round((s / 7) × 100)
//   0 < progress ≤ 100
//
// Validates: Requirements 5.5

describe('Feature: employee-self-service-hub, Property 6: Deboarding Progress Calculation', () => {
  it('progress is always > 0 and ≤ 100 for any valid stage index (0-6)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }), // 0-based stage index
        (stageIndex) => {
          const progress = calculateProgress(stageIndex);
          expect(progress).toBeGreaterThan(0);
          expect(progress).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('progress equals Math.round(((stageIndex + 1) / 7) * 100) for any stage index', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }), // 0-based stage index
        (stageIndex) => {
          const progress = calculateProgress(stageIndex);
          const expected = Math.round(((stageIndex + 1) / 7) * 100);
          expect(progress).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('progress is monotonically increasing (higher stage → higher or equal progress)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }), // stageA: 0-5 (so stageB = stageA + 1 is valid)
        (stageA) => {
          const stageB = stageA + 1;
          const progressA = calculateProgress(stageA);
          const progressB = calculateProgress(stageB);
          expect(progressB).toBeGreaterThanOrEqual(progressA);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('stage 6 (last stage, completed) always yields progress = 100', () => {
    const progress = calculateProgress(6);
    expect(progress).toBe(100);
  });

  it('stage 0 (first stage) always yields progress = Math.round((1/7) * 100) = 14', () => {
    const progress = calculateProgress(0);
    expect(progress).toBe(Math.round((1 / 7) * 100));
    expect(progress).toBe(14);
  });
});
