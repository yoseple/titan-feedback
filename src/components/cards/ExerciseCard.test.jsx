// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import ExerciseCard from './ExerciseCard.jsx';

// ExerciseCard is self-contained: it only reads `ex`/`history` and calls the callback
// props. No Firebase/router/network involved, so nothing needs mocking. lucide-react
// icons render as plain inline SVGs under jsdom.

const DATE = '2026-07-01';

const weightedEx = { name: 'Bench Press', sets: '1', reps: '8', type: 'weighted' };

function setup(props = {}) {
  const onLog = vi.fn();
  const onDeleteLog = vi.fn();
  const onViewHistory = vi.fn();
  const utils = render(
    <ExerciseCard
      ex={weightedEx}
      onLog={onLog}
      onDeleteLog={onDeleteLog}
      onViewHistory={onViewHistory}
      history={[]}
      date={DATE}
      isComplete={false}
      simpleMode={false}
      {...props}
    />
  );
  return { ...utils, onLog, onDeleteLog, onViewHistory };
}

// The set's "check" control is the only button carrying the w-10 sizing class; the
// header's history (BarChart) button does not. Filtering on that keeps the locator
// stable regardless of how many sets render.
const checkButtons = () =>
  screen.getAllByRole('button').filter((b) => b.className.includes('w-10'));

afterEach(() => cleanup());

describe('ExerciseCard', () => {
  it('(a) flags the row (red border) and does not call onLog when weight/reps are empty, then clears', () => {
    const { onLog } = setup();
    // Expand: clicking the name bubbles to the header row's onClick.
    fireEvent.click(screen.getByText('Bench Press'));

    vi.useFakeTimers();
    fireEvent.click(checkButtons()[0]);

    // Empty weighted set is a no-op for logging...
    expect(onLog).not.toHaveBeenCalled();
    // ...and both missing inputs are flagged with a red border.
    expect(screen.getByPlaceholderText('Lbs')).toHaveClass('border-red-500');
    expect(screen.getByPlaceholderText('Reps')).toHaveClass('border-red-500');

    // The warning auto-clears after 1600ms.
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByPlaceholderText('Lbs')).not.toHaveClass('border-red-500');
    expect(screen.getByPlaceholderText('Lbs')).toHaveClass('border-gray-600');
    expect(screen.getByPlaceholderText('Reps')).not.toHaveClass('border-red-500');

    vi.useRealTimers();
  });

  it('(b) calls onLog with the entered weight and reps', () => {
    const { onLog } = setup();
    fireEvent.click(screen.getByText('Bench Press'));

    fireEvent.change(screen.getByPlaceholderText('Lbs'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('Reps'), { target: { value: '8' } });
    fireEvent.click(checkButtons()[0]);

    // onLog(name, weight, reps, distance||0, duration||0)
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith('Bench Press', '100', '8', 0, 0);
  });

  it('(c) restores a set as completed from a matching history log for the day', () => {
    const history = [
      {
        id: 'log-1',
        exercise: 'Bench Press',
        date: DATE,
        weight: '135',
        reps: '8',
        timestamp: { toMillis: () => 1000 },
      },
    ];
    setup({ history });
    fireEvent.click(screen.getByText('Bench Press'));

    const lbs = screen.getByPlaceholderText('Lbs');
    const reps = screen.getByPlaceholderText('Reps');
    // Values restored from the log...
    expect(lbs.value).toBe('135');
    expect(reps.value).toBe('8');
    // ...inputs locked because the set is completed...
    expect(lbs).toBeDisabled();
    expect(reps).toBeDisabled();
    // ...and the check control shows the completed (green) state.
    expect(checkButtons()[0]).toHaveClass('bg-green-600');
  });

  it('(d) preserves a typed cardio distance across a history prop change', () => {
    const cardioEx = { name: 'Treadmill Run', sets: '1', reps: '20', type: 'cardio' };
    const props = {
      ex: cardioEx,
      onLog: vi.fn(),
      onDeleteLog: vi.fn(),
      onViewHistory: vi.fn(),
      history: [],
      date: DATE,
      isComplete: false,
      simpleMode: false,
    };
    const { rerender } = render(<ExerciseCard {...props} />);
    fireEvent.click(screen.getByText('Treadmill Run'));

    fireEvent.change(screen.getByPlaceholderText('Dist'), { target: { value: '5' } });
    expect(screen.getByPlaceholderText('Dist').value).toBe('5');

    // A new history reference (an unrelated log) re-fires the sync effect. The typed,
    // uncompleted distance must survive rather than being wiped back to empty.
    rerender(
      <ExerciseCard
        {...props}
        history={[{ id: 'other', exercise: 'Squat', date: DATE, timestamp: { toMillis: () => 1 } }]}
      />
    );
    expect(screen.getByPlaceholderText('Dist').value).toBe('5');
  });
});
