// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

// A tiny consumer that fires a toast on click, so we exercise the real context wiring.
function Fire({ message = 'Saved!', type = 'info', duration }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(message, type, duration)}>
      fire
    </button>
  );
}

const renderWithProvider = (childProps = {}) =>
  render(
    <ToastProvider>
      <Fire {...childProps} />
    </ToastProvider>
  );

// The live-region container is always present (even with zero toasts).
const getLiveRegion = () => screen.getByRole('status');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('renders the live region with polite aria attributes', () => {
    renderWithProvider();
    const region = getLiveRegion();
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('shows a toast message when useToast() is fired by a child', () => {
    renderWithProvider({ message: 'Logged to Lunch' });
    // Nothing shown until the consumer fires it.
    expect(screen.queryByText('Logged to Lunch')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'fire' }));

    const message = screen.getByText('Logged to Lunch');
    expect(message).toBeInTheDocument();
    // The message lives inside the role="status" live region.
    expect(getLiveRegion()).toContainElement(message);
  });

  it('applies different styling for success vs error toasts', () => {
    // success (scope queries to this render's container so parallel renders don't collide)
    const success = render(
      <ToastProvider>
        <Fire message="Success msg" type="success" />
      </ToastProvider>
    );
    const successScope = within(success.container);
    fireEvent.click(successScope.getByRole('button', { name: 'fire' }));
    const successCard = successScope.getByText('Success msg').closest('div');
    expect(successCard).toHaveClass('text-emerald-300');
    expect(successCard).not.toHaveClass('text-red-300');

    // error (fresh provider so the two don't collide)
    const error = render(
      <ToastProvider>
        <Fire message="Error msg" type="error" />
      </ToastProvider>
    );
    const errorScope = within(error.container);
    fireEvent.click(errorScope.getByRole('button', { name: 'fire' }));
    const errorCard = errorScope.getByText('Error msg').closest('div');
    expect(errorCard).toHaveClass('text-red-300');
    expect(errorCard).not.toHaveClass('text-emerald-300');

    // The two variants really do differ.
    expect(successCard.className).not.toEqual(errorCard.className);
  });

  it('dismisses a toast when it is clicked', () => {
    renderWithProvider({ message: 'Click to close' });
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));

    const card = screen.getByText('Click to close').closest('div');
    expect(card).toBeInTheDocument();

    fireEvent.click(card);

    expect(screen.queryByText('Click to close')).not.toBeInTheDocument();
  });

  it('auto-dismisses after the given duration', () => {
    vi.useFakeTimers();
    renderWithProvider({ message: 'Auto gone', duration: 3200 });

    // fireEvent triggers a state update; keep it inside act with fake timers active.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    });
    expect(screen.getByText('Auto gone')).toBeInTheDocument();

    // Just before the duration elapses it is still visible.
    act(() => {
      vi.advanceTimersByTime(3199);
    });
    expect(screen.getByText('Auto gone')).toBeInTheDocument();

    // Crossing the duration boundary removes it.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Auto gone')).not.toBeInTheDocument();
  });

  it('does not auto-dismiss when duration is 0 (falsy)', () => {
    vi.useFakeTimers();
    renderWithProvider({ message: 'Sticky', duration: 0 });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    });
    expect(screen.getByText('Sticky')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(100000);
    });
    // No timeout was scheduled, so it stays put.
    expect(screen.getByText('Sticky')).toBeInTheDocument();
  });
});
