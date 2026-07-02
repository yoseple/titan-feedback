// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Onboarding imports the three math helpers from utils/nutrition, but that module
// pulls in Firebase (db, workerClient, ai) at import time. Swap it for the pure
// domain math so the test never touches Firebase or the network while still
// exercising the REAL calorie/macro/height computation.
vi.mock('../../utils/nutrition', async () => {
  const actual = await vi.importActual('../../domain/nutritionMath');
  return {
    calculateTDEE: actual.calculateTDEE,
    calculateTargetCalories: actual.calculateTargetCalories,
    computeMacroTargets: actual.computeMacroTargets,
  };
});

import Onboarding from './Onboarding';

afterEach(() => cleanup());

// type=number inputs are simplest to drive deterministically with fireEvent.change
const setValue = (input, value) => fireEvent.change(input, { target: { value } });
const nextBtn = () => screen.getByRole('button', { name: /next/i });

describe('Onboarding', () => {
  it('step 1 Next stays disabled until age > 0 (empty, 0 and negative keep it disabled)', () => {
    render(<Onboarding onComplete={vi.fn()} />);
    const age = screen.getByPlaceholderText('Years');

    expect(nextBtn()).toBeDisabled();          // empty age
    setValue(age, '0');
    expect(nextBtn()).toBeDisabled();          // zero
    setValue(age, '-5');
    expect(nextBtn()).toBeDisabled();          // negative
    setValue(age, '30');
    expect(nextBtn()).toBeEnabled();           // positive -> enabled
  });

  it('step 2 Next requires both weight > 0 and feet > 0', () => {
    render(<Onboarding onComplete={vi.fn()} />);

    // advance past step 1
    setValue(screen.getByPlaceholderText('Years'), '30');
    fireEvent.click(nextBtn());

    const weight = screen.getByPlaceholderText('180');
    const feet = screen.getByPlaceholderText('5');

    expect(nextBtn()).toBeDisabled();          // both blank
    setValue(weight, '200');
    expect(nextBtn()).toBeDisabled();          // feet still blank
    setValue(weight, '0');
    setValue(feet, '5');
    expect(nextBtn()).toBeDisabled();          // weight 0
    setValue(weight, '-10');
    expect(nextBtn()).toBeDisabled();          // weight negative
    setValue(weight, '200');
    expect(nextBtn()).toBeEnabled();           // both positive -> enabled
  });

  it('completing every step with valid values calls onComplete with numeric caloriesTarget, macroTargets and height (cm)', () => {
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);

    // step 1
    setValue(screen.getByPlaceholderText('Years'), '30');
    fireEvent.click(nextBtn());

    // step 2 — 5 ft 10 in
    setValue(screen.getByPlaceholderText('180'), '200');
    setValue(screen.getByPlaceholderText('5'), '5');
    setValue(screen.getByPlaceholderText('10'), '10');
    fireEvent.click(nextBtn());

    // step 3 — defaults (maintenance / moderate) are fine; go to the plan reveal
    fireEvent.click(screen.getByRole('button', { name: /see my plan/i }));

    // step 4 — the "Your Plan" reveal, then start
    expect(screen.getByText(/your plan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start titan/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0][0];

    // caloriesTarget is a real positive number
    expect(typeof payload.caloriesTarget).toBe('number');
    expect(Number.isFinite(payload.caloriesTarget)).toBe(true);
    expect(payload.caloriesTarget).toBeGreaterThan(0);

    // macroTargets carries numeric protein/carbs/fats
    expect(payload.macroTargets).toEqual(
      expect.objectContaining({
        protein: expect.any(Number),
        carbs: expect.any(Number),
        fats: expect.any(Number),
      })
    );

    // height converted to cm: round(5*30.48 + 10*2.54) = 178
    expect(typeof payload.height).toBe('number');
    expect(payload.height).toBe(178);

    expect(payload.onboardingComplete).toBe(true);
  });

  it('reaching Launch with a negative value (inches) shows the validation error and does not complete', () => {
    const onComplete = vi.fn();
    render(<Onboarding onComplete={onComplete} />);

    // step 1 — valid age
    setValue(screen.getByPlaceholderText('Years'), '30');
    fireEvent.click(nextBtn());

    // step 2 — feet passes its guard so Next enables, but a negative inches
    // drives the computed height (cm) negative -> handleFinish rejects it.
    setValue(screen.getByPlaceholderText('180'), '200');
    setValue(screen.getByPlaceholderText('5'), '1');    // feet > 0 -> Next enabled
    setValue(screen.getByPlaceholderText('10'), '-40'); // negative inches
    expect(nextBtn()).toBeEnabled();
    fireEvent.click(nextBtn());

    // step 3 — "See my plan" triggers validation; the computed height is negative
    fireEvent.click(screen.getByRole('button', { name: /see my plan/i }));

    expect(
      screen.getByText(/please enter a valid age, weight, and height/i)
    ).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
