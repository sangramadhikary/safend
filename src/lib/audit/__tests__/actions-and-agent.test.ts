/**
 * Tests for the action catalog and the user-agent parser.
 *
 * These two modules decide how an entry is classified and how a device is
 * described, so their correctness determines whether the admin UI's filters mean
 * anything. Two behaviours are load-bearing and easy to break:
 *
 *   - `resolveAction` must accept BOTH a catalog code and a legacy label, because
 *     years of historical rows store the label. If that regressed, every existing
 *     record would fall through to the heuristic path and be reclassified.
 *
 *   - `parseBrowser` must test the most specific token first. Edge and Opera both
 *     contain "Chrome" in their UA strings and Chrome contains "Safari", so a
 *     naive ordering silently reports every Edge user as Chrome.
 */

import { describe, it, expect } from 'vitest';
import {
  AUDIT_ACTIONS,
  ACTION_LIST,
  SEVERITY_LIST,
  CATEGORY_LIST,
  getAction,
  resolveAction,
  inferClassification,
  SEVERITY_STYLES,
  CATEGORY_STYLES,
} from '../actions';
import { parseOs, parseBrowser, parseDeviceType, parseUserAgent } from '../user-agent';

describe('action catalog integrity', () => {
  it('keys every entry by its own code', () => {
    for (const [key, definition] of Object.entries(AUDIT_ACTIONS)) {
      expect(definition.code).toBe(key);
    }
  });

  it('gives every entry a valid severity and category', () => {
    for (const definition of ACTION_LIST) {
      expect(SEVERITY_LIST).toContain(definition.severity);
      expect(CATEGORY_LIST).toContain(definition.category);
    }
  });

  it('provides a style for every severity and category', () => {
    for (const severity of SEVERITY_LIST) {
      expect(SEVERITY_STYLES[severity]).toBeDefined();
    }
    for (const category of CATEGORY_LIST) {
      expect(CATEGORY_STYLES[category]).toBeDefined();
    }
  });

  it('never enables snapshot capture for routine navigation', () => {
    // Snapshotting page views would generate an image per navigation: hundreds of
    // megabytes per user per week of personal data with no evidential value.
    expect(AUDIT_ACTIONS['nav.page.view'].snapshot).toBe(false);
    expect(AUDIT_ACTIONS['nav.record.view'].snapshot).toBe(false);

    const readActions = ACTION_LIST.filter((a) => a.category === 'read');
    expect(readActions.every((a) => a.snapshot === false)).toBe(true);
  });

  it('marks destructive and privilege-altering actions critical', () => {
    const shouldBeCritical = ACTION_LIST.filter(
      (a) => a.category === 'delete' || a.category === 'permission'
    );
    expect(shouldBeCritical.length).toBeGreaterThan(0);
    for (const definition of shouldBeCritical) {
      expect(definition.severity).toBe('critical');
    }
  });
});

describe('resolveAction', () => {
  it('resolves a catalog code', () => {
    expect(resolveAction('hr.employee.update')?.label).toBe('Employee Updated');
  });

  it('resolves a legacy operator-facing label', () => {
    // Historical rows and the transitional call sites pass labels, not codes.
    expect(resolveAction('Employee Updated')?.code).toBe('hr.employee.update');
    expect(resolveAction('Page Viewed')?.code).toBe('nav.page.view');
    expect(resolveAction('Logged In')?.code).toBe('auth.login');
  });

  it('resolves a label case-insensitively', () => {
    expect(resolveAction('employee updated')?.code).toBe('hr.employee.update');
  });

  it('returns undefined for an unknown action', () => {
    expect(resolveAction('Nonsense Action')).toBeUndefined();
    expect(getAction('not.a.code')).toBeUndefined();
  });
});

describe('inferClassification — fallback for uncatalogued actions', () => {
  it('classifies dynamically-composed delete actions as critical', () => {
    // The legacy `recordDeleted` helper builds `${recordType} Deleted`.
    expect(inferClassification('Quotation Deleted')).toEqual({
      category: 'delete',
      severity: 'critical',
    });
  });

  it('classifies auth failures as warnings', () => {
    expect(inferClassification('Login Failed')).toEqual({
      category: 'auth',
      severity: 'warning',
    });
  });

  it('classifies exports as critical', () => {
    // A bulk export is how data leaves the building.
    expect(inferClassification('Data Exported').severity).toBe('critical');
  });

  it('classifies reads as info', () => {
    expect(inferClassification('Something Viewed')).toEqual({
      category: 'read',
      severity: 'info',
    });
  });

  it('falls back to system/info for anything unrecognized', () => {
    expect(inferClassification('zzz')).toEqual({ category: 'system', severity: 'info' });
  });
});

describe('parseBrowser — specificity ordering', () => {
  const UA = {
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87',
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
    androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  };

  it('reports Edge as Edge, not Chrome', () => {
    // Edge's UA contains both "Chrome" and "Safari".
    expect(parseBrowser(UA.edge)).toBe('Edge 126');
  });

  it('reports Opera as Opera, not Chrome', () => {
    expect(parseBrowser(UA.opera)).toBe('Opera 111');
  });

  it('reports Chrome as Chrome, not Safari', () => {
    expect(parseBrowser(UA.chrome)).toBe('Chrome 126');
  });

  it('reports Safari correctly using the Version token', () => {
    expect(parseBrowser(UA.safari)).toBe('Safari 17');
  });

  it('reports Firefox correctly', () => {
    expect(parseBrowser(UA.firefox)).toBe('Firefox 127');
  });

  it('reports Chrome on iOS by its CriOS token', () => {
    const criOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
    expect(parseBrowser(criOS)).toBe('Chrome 126');
  });

  describe('parseOs', () => {
    it('reports Windows 10 and 11 as an honest pair', () => {
      // Both report "Windows NT 10.0"; the two are indistinguishable in a UA
      // string, so guessing one would be wrong half the time.
      expect(parseOs(UA.edge)).toBe('Windows 10/11');
    });

    it('extracts macOS, Android and iOS versions', () => {
      expect(parseOs(UA.safari)).toBe('macOS 10.15');
      expect(parseOs(UA.androidChrome)).toBe('Android 14');
      expect(parseOs(UA.iphone)).toBe('iOS 17.5');
    });

    it('returns Unknown for an unrecognizable agent', () => {
      expect(parseOs('curl/8.4.0')).toBe('Unknown');
    });
  });

  describe('parseDeviceType', () => {
    it('classifies desktop, mobile and tablet', () => {
      expect(parseDeviceType(UA.chrome)).toBe('desktop');
      expect(parseDeviceType(UA.iphone)).toBe('mobile');
      expect(parseDeviceType(UA.ipad)).toBe('tablet');
    });

    it('classifies an Android device without the Mobile token as a tablet', () => {
      const androidTablet = 'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
      expect(parseDeviceType(androidTablet)).toBe('tablet');
    });

    it('classifies an Android phone as mobile', () => {
      expect(parseDeviceType(UA.androidChrome)).toBe('mobile');
    });

    it('returns unknown for an empty agent', () => {
      expect(parseDeviceType('')).toBe('unknown');
    });
  });

  describe('parseUserAgent', () => {
    it('produces a combined label', () => {
      expect(parseUserAgent(UA.edge)).toMatchObject({
        os: 'Windows 10/11',
        browser: 'Edge 126',
        deviceType: 'desktop',
        label: 'Windows 10/11 · Edge 126',
      });
    });

    it('degrades gracefully on a missing agent rather than throwing', () => {
      expect(parseUserAgent(null)).toMatchObject({
        os: 'Unknown',
        browser: 'Unknown',
        deviceType: 'unknown',
      });
      expect(parseUserAgent(undefined).label).toBe('Unknown device');
    });
  });
});
