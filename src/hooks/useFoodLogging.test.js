// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFoodLogging } from './useFoodLogging';

// This hook is pure orchestration over ../domain/foodMath (pure math) and
// ../utils/date (pure) — no Firebase, no network — so we let the real domain
// run and only inject a fake `actions` object with spies. This asserts the
// hook's real routing/computation, not implementation details.

function makeActions(overrides = {}) {
  return {
    saveFood: vi.fn().mockResolvedValue(undefined),
    updateFood: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Weight-scalable item: macros are per 100 g.
const per100gItem = {
  name: 'Rice',
  weight: '100g',
  calories: 200,
  protein: 4,
  carbs: 44,
  fats: 1,
  targetMeal: 'lunch',
};

// A stored V2 food_log (immutable basis + amount) for the edit path.
const v2Log = {
  name: 'Rice',
  id: 'log-123',
  base: { calories: 200, protein: 4, carbs: 44, fats: 1 },
  baseGrams: 100,
  quantity: 100,
  unit: 'g',
  schemaVersion: 2,
  mealType: 'lunch',
};

function setup(props = {}) {
  const actions = props.actions || makeActions();
  const onLogged = props.onLogged || vi.fn();
  const onError = props.onError || vi.fn();
  const viewDate = props.viewDate || new Date('2026-07-01T12:00:00');
  const utils = renderHook(() =>
    useFoodLogging({ actions, viewDate, onLogged, onError }),
  );
  return { ...utils, actions, onLogged, onError };
}

describe('useFoodLogging', () => {
  it('handleFoodSelect on a per-100g item sets scannedResult with a basis and defaults unit to g', () => {
    const { result } = setup();

    act(() => {
      result.current.handleFoodSelect(per100gItem);
    });

    const sr = result.current.scannedResult;
    expect(sr).toBeTruthy();
    expect(sr.basis).toBeTruthy();
    expect(sr.basis.gramScalable).toBe(true);
    expect(sr.basis.baseGrams).toBe(100);
    expect(sr.basis.base.calories).toBe(200);
    // Gram-scalable foods default to grams, with amount seeded to the base grams.
    expect(result.current.servingUnit).toBe('g');
    expect(result.current.numServings).toBe(100);
  });

  it('handleScanConfirm calls saveFood (not updateFood) with the computed totals', async () => {
    const { result, actions, onLogged } = setup();

    act(() => {
      result.current.handleFoodSelect(per100gItem);
    });
    await act(async () => {
      await result.current.handleScanConfirm();
    });

    expect(actions.saveFood).toHaveBeenCalledTimes(1);
    expect(actions.updateFood).not.toHaveBeenCalled();

    const [payload, dateStr, mealType] = actions.saveFood.mock.calls[0];
    // 100 g of a per-100g basis => the base macros, unscaled.
    expect(payload).toMatchObject({
      name: 'Rice',
      calories: 200,
      protein: 4,
      carbs: 44,
      fats: 1,
      unit: 'g',
      quantity: 100,
      schemaVersion: 2,
    });
    expect(typeof dateStr).toBe('string');
    expect(mealType).toBe('lunch');
    // Success side effects: report new (not edit) and clear the modal.
    expect(onLogged).toHaveBeenCalledWith(payload, false);
    expect(result.current.scannedResult).toBeNull();
  });

  it('handleScanConfirm does NOT fire when numServings is 0', async () => {
    const { result, actions, onLogged } = setup();

    act(() => {
      result.current.handleFoodSelect(per100gItem);
    });
    act(() => {
      result.current.setNumServings(0);
    });
    await act(async () => {
      await result.current.handleScanConfirm();
    });

    expect(actions.saveFood).not.toHaveBeenCalled();
    expect(actions.updateFood).not.toHaveBeenCalled();
    expect(onLogged).not.toHaveBeenCalled();
    // Guarded: modal stays open, nothing cleared.
    expect(result.current.scannedResult).toBeTruthy();
  });

  it('handleEditLog sets __editingLogId so a subsequent confirm routes to updateFood', async () => {
    const { result, actions } = setup();

    act(() => {
      result.current.handleEditLog(v2Log);
    });

    // The explicit edit marker is the ONLY signal that routes confirm to updateFood.
    expect(result.current.scannedResult.__editingLogId).toBe('log-123');
    expect(result.current.numServings).toBe(100);
    expect(result.current.servingUnit).toBe('g');

    await act(async () => {
      await result.current.handleScanConfirm();
    });

    expect(actions.updateFood).toHaveBeenCalledTimes(1);
    expect(actions.saveFood).not.toHaveBeenCalled();

    const [logId, payload, dateStr, mealType] = actions.updateFood.mock.calls[0];
    expect(logId).toBe('log-123');
    expect(payload).toMatchObject({ calories: 200, unit: 'g', quantity: 100, schemaVersion: 2 });
    expect(typeof dateStr).toBe('string');
    expect(mealType).toBe('lunch');
  });

  it('calls onError and does NOT clear scannedResult when the action throws', async () => {
    const err = new Error('write failed');
    const actions = makeActions({ saveFood: vi.fn().mockRejectedValue(err) });
    const { result, onLogged, onError } = setup({ actions });

    act(() => {
      result.current.handleFoodSelect(per100gItem);
    });
    await act(async () => {
      await result.current.handleScanConfirm();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const [reportedErr, reportedPayload] = onError.mock.calls[0];
    expect(reportedErr).toBe(err);
    expect(reportedPayload).toMatchObject({ calories: 200, schemaVersion: 2 });
    // No false success, and the modal state is preserved for retry.
    expect(onLogged).not.toHaveBeenCalled();
    expect(result.current.scannedResult).toBeTruthy();
  });
});
