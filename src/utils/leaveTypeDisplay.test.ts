import { describe, it, expect } from 'vitest';
import { displayLeaveType } from './leaveTypeDisplay';

describe('displayLeaveType', () => {
  it('maps "Urgent Leave" to "Sick Leave"', () => {
    expect(displayLeaveType('Urgent Leave')).toBe('Sick Leave');
  });

  it('passes through "Sick Leave" unchanged', () => {
    expect(displayLeaveType('Sick Leave')).toBe('Sick Leave');
  });

  it('passes through "Planned Leave" unchanged', () => {
    expect(displayLeaveType('Planned Leave')).toBe('Planned Leave');
  });

  it('passes through "Abscond" unchanged', () => {
    expect(displayLeaveType('Abscond')).toBe('Abscond');
  });

  it('passes through an empty string unchanged', () => {
    expect(displayLeaveType('')).toBe('');
  });
});
