import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('always forwards console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../logger');
    logger.error('test error');
    expect(errorSpy).toHaveBeenCalledWith('test error');
    errorSpy.mockRestore();
  });

  it('gates log/warn behind DEV mode', async () => {
    // In test environment, import.meta.env.DEV is true
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { logger } = await import('../logger');
    logger.log('test log');
    logger.warn('test warn');

    // DEV is true in test env, so these should be called
    expect(logSpy).toHaveBeenCalledWith('test log');
    expect(warnSpy).toHaveBeenCalledWith('test warn');

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('supports multiple arguments', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('../logger');
    logger.error('msg', { detail: 1 }, 42);
    expect(errorSpy).toHaveBeenCalledWith('msg', { detail: 1 }, 42);
    errorSpy.mockRestore();
  });
});
