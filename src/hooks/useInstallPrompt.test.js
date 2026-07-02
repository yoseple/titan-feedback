// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useInstallPrompt } from './useInstallPrompt';

// useInstallPrompt captures the browser's beforeinstallprompt event so the app can
// offer a real Install button. It only fires on Chrome/Android, so under jsdom we
// synthesize the event (giving it prompt()/userChoice like the real BeforeInstallPromptEvent).
// Each dispatch/prompt triggers a setState, so we wrap them in act().

// Build a fake beforeinstallprompt event. It IS the object the hook stashes as
// `deferred`, so it must carry preventDefault, prompt() and a userChoice promise.
function makePromptEvent() {
  const event = new Event('beforeinstallprompt');
  event.preventDefault = vi.fn();
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  return event;
}

afterEach(() => cleanup());

describe('useInstallPrompt', () => {
  it('starts with canInstall false', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it('flips canInstall true on beforeinstallprompt (and calls preventDefault)', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makePromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.canInstall).toBe(true);
  });

  it('promptInstall triggers the deferred prompt and resets canInstall', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const event = makePromptEvent();

    act(() => {
      window.dispatchEvent(event);
    });
    expect(result.current.canInstall).toBe(true);

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.canInstall).toBe(false);
  });

  it('resets canInstall to false on appinstalled', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(makePromptEvent());
    });
    expect(result.current.canInstall).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.canInstall).toBe(false);
  });
});
