// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ConsistencyHeatmap from './ConsistencyHeatmap.jsx';
import { getLocalDate } from '../../utils/date';

// ConsistencyHeatmap is pure presentation: it derives everything from the
// workoutLogs/foodLogs arrays (each entry keyed by a `date` string). No
// Firebase/router involved. lucide-react renders as inline SVG under jsdom.
//
// The grid and "today" are built from getLocalDate(new Date()) with setDate()
// arithmetic, so we compute expected day strings the SAME way the component does
// (replicating setDate rather than ms math) to stay timezone/DST-proof.
const dayAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getLocalDate(d);
};

afterEach(() => cleanup());

describe('ConsistencyHeatmap', () => {
  // A mix inside the 28-day window: one workout-only, one food-only, one "both",
  // plus a stale log OUTSIDE the window that must NOT be counted. The remaining
  // days stay empty.
  const workoutOnly = dayAgo(1);
  const foodOnly = dayAgo(2);
  const bothDay = dayAgo(3);
  const outsideWindow = dayAgo(40);

  const workoutLogs = [
    { date: workoutOnly },
    { date: bothDay },
    { date: outsideWindow },
  ];
  const foodLogs = [
    { date: foodOnly },
    { date: bothDay },
    { date: outsideWindow },
  ];

  it('counts only distinct active days within the last 28 ("N of 28 days")', () => {
    render(<ConsistencyHeatmap workoutLogs={workoutLogs} foodLogs={foodLogs} />);
    // workout-only + food-only + both = 3 active days; the day-40 log is ignored.
    expect(screen.getByText('3 of 28 days')).toBeInTheDocument();
  });

  it('renders the Food / Workout / Both legend labels', () => {
    render(<ConsistencyHeatmap workoutLogs={workoutLogs} foodLogs={foodLogs} />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Workout')).toBeInTheDocument();
    expect(screen.getByText('Both')).toBeInTheDocument();
  });

  it('exposes the grid as role=img with a descriptive aria-label', () => {
    render(<ConsistencyHeatmap workoutLogs={workoutLogs} foodLogs={foodLogs} />);
    const grid = screen.getByRole('img', {
      name: '3 of the last 28 days had a logged workout or meal',
    });
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute(
      'aria-label',
      '3 of the last 28 days had a logged workout or meal'
    );
  });

  it('reports 0 active days when both log sets are empty', () => {
    render(<ConsistencyHeatmap workoutLogs={[]} foodLogs={[]} />);
    expect(screen.getByText('0 of 28 days')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: '0 of the last 28 days had a logged workout or meal',
      })
    ).toBeInTheDocument();
  });
});
