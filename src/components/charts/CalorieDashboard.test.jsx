// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CalorieDashboard from './CalorieDashboard.jsx';

// CalorieDashboard is pure presentation over its numeric props. The Phase 4
// changes surface an "over target" state: a macro whose current exceeds its goal
// turns its value red (text-red-400), and once consumed > goal the remaining
// calories go negative and render red (text-red-500). Under target stays neutral.

afterEach(() => cleanup());

describe('CalorieDashboard', () => {
  it('applies over-target styling when a macro exceeds its goal (and not when under)', () => {
    render(
      <CalorieDashboard
        consumed={1500}
        goal={2000}
        protein={200}
        proteinGoal={150}
        carbs={100}
        carbsGoal={200}
        fats={50}
        fatsGoal={70}
      />
    );

    // Protein 200g > 150g goal -> over-target red value.
    const proteinValue = screen.getByText('200g');
    expect(proteinValue).toHaveClass('text-red-400');
    expect(proteinValue).not.toHaveClass('text-white');

    // Carbs 100g < 200g goal -> stays neutral (white, never red).
    const carbsValue = screen.getByText('100g');
    expect(carbsValue).toHaveClass('text-white');
    expect(carbsValue).not.toHaveClass('text-red-400');

    // Fats 50g < 70g goal -> also neutral.
    const fatsValue = screen.getByText('50g');
    expect(fatsValue).toHaveClass('text-white');
    expect(fatsValue).not.toHaveClass('text-red-400');
  });

  it('turns remaining calories negative and red when consumed exceeds goal', () => {
    render(
      <CalorieDashboard
        consumed={2500}
        goal={2000}
        protein={100}
        proteinGoal={150}
        carbs={100}
        carbsGoal={200}
        fats={50}
        fatsGoal={70}
      />
    );

    // 2000 - 2500 = -500 remaining, rendered red.
    const remaining = screen.getByText('-500');
    expect(remaining).toHaveClass('text-red-500');
    expect(remaining).not.toHaveClass('text-white');
  });

  it('keeps remaining calories neutral (non-red) when under the goal', () => {
    render(
      <CalorieDashboard
        consumed={1200}
        goal={2000}
        protein={100}
        proteinGoal={150}
        carbs={100}
        carbsGoal={200}
        fats={50}
        fatsGoal={70}
      />
    );

    // 2000 - 1200 = 800 remaining, rendered white (not red).
    const remaining = screen.getByText('800');
    expect(remaining).toHaveClass('text-white');
    expect(remaining).not.toHaveClass('text-red-500');
  });
});
