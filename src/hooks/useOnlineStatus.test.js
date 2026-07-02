// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

// The hook seeds from navigator.onLine (true in jsdom) and then tracks the
// window online/offline events. Event dispatch triggers a setState, so each
// dispatch is wrapped in act() to flush the update before we assert.

afterEach(() => {
  cleanup();
});

describe('useOnlineStatus', () => {
  it('returns true initially (from navigator.onLine)', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('flips to false on a window "offline" event and back to true on "online"', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
