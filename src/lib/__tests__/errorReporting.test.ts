import { describe, it, expect, beforeEach } from 'vitest';
import { captureError, getRecentErrors, clearErrors } from '../errorReporting';

describe('errorReporting', () => {
  beforeEach(() => {
    clearErrors();
  });

  it('captures errors', () => {
    captureError(new Error('test error'));
    const errors = getRecentErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('test error');
    expect(errors[0].type).toBe('error');
    expect(errors[0].timestamp).toBeGreaterThan(0);
  });

  it('captures errors with context', () => {
    captureError(new Error('network fail'), 'network', { url: '/api/data', status: 500 });
    const errors = getRecentErrors();
    expect(errors[0].type).toBe('network');
    expect(errors[0].context?.url).toBe('/api/data');
  });

  it('caps buffer at MAX_STORED_ERRORS', () => {
    for (let i = 0; i < 60; i++) {
      captureError(new Error(`error ${i}`));
    }
    const errors = getRecentErrors();
    expect(errors.length).toBe(50);
    // Should keep the most recent
    expect(errors[errors.length - 1].message).toBe('error 59');
  });

  it('clears errors', () => {
    captureError(new Error('test'));
    clearErrors();
    expect(getRecentErrors().length).toBe(0);
  });

  it('returns readonly array', () => {
    captureError(new Error('test'));
    const errors = getRecentErrors();
    expect(Array.isArray(errors)).toBe(true);
  });
});
