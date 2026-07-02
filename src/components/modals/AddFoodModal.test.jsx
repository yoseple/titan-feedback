// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// AddFoodModal pulls its data from useTitanData and its search/AI helpers from
// utils/nutrition + lib/ai — all of which reach Firebase/network at import time.
// Stub every one of them so the test exercises ONLY the modal's own render/click
// wiring (the Phase-1 quick-log button vs the row body) with no I/O.

// vi.hoisted so the SAME food object the mock hands the component is the one we
// assert the callbacks were called with.
const { historyFood } = vi.hoisted(() => ({
  historyFood: {
    id: 'hist-1',
    name: 'Rice',
    brand: 'Generic',
    weight_amount: '150 g',
    calories: 300,
  },
}));

vi.mock('../../hooks/useTitanData', () => ({
  useTitanData: () => ({ foodHistory: [historyFood] }),
}));

vi.mock('../../utils/nutrition', () => ({
  searchAllFood: vi.fn().mockResolvedValue([]),
  getSuggestions: vi.fn().mockResolvedValue([]),
  searchByBarcode: vi.fn().mockResolvedValue(null),
  searchAI: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/ai', () => ({
  generateContent: vi.fn().mockResolvedValue(null),
}));

import AddFoodModal from './AddFoodModal.jsx';

function setup(props = {}) {
  const onAddFood = vi.fn();
  const onQuickLog = vi.fn();
  const onClose = vi.fn();
  const onScanFood = vi.fn();
  const onDeleteHistory = vi.fn();
  const utils = render(
    <AddFoodModal
      mealType="Lunch"
      onClose={onClose}
      onAddFood={onAddFood}
      onScanFood={onScanFood}
      onDeleteHistory={onDeleteHistory}
      onQuickLog={onQuickLog}
      savedMeals={[]}
      {...props}
    />
  );
  return { ...utils, onAddFood, onQuickLog, onClose, onScanFood, onDeleteHistory };
}

afterEach(() => cleanup());

describe('AddFoodModal — Recent row quick-log (Phase 1)', () => {
  it('renders the food_history item in the Recent list by default', () => {
    setup();
    expect(screen.getByText('Rice')).toBeInTheDocument();
    // aria-label proves the quick-log affordance rendered for this row.
    expect(
      screen.getByRole('button', { name: /quick log rice/i })
    ).toBeInTheDocument();
  });

  it('the ⚡ quick-log button calls onQuickLog(food) and NOT onAddFood', () => {
    const { onQuickLog, onAddFood } = setup();

    fireEvent.click(screen.getByRole('button', { name: /quick log rice/i }));

    expect(onQuickLog).toHaveBeenCalledTimes(1);
    expect(onQuickLog).toHaveBeenCalledWith(historyFood);
    // Quick-log must be a distinct action — it must not open the add/confirm sheet.
    expect(onAddFood).not.toHaveBeenCalled();
  });

  it('clicking the row body calls onAddFood(food) and NOT onQuickLog', () => {
    const { onAddFood, onQuickLog } = setup();

    // The name lives inside the row's <button>; the click bubbles to its onClick.
    fireEvent.click(screen.getByText('Rice'));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    expect(onAddFood).toHaveBeenCalledWith(historyFood);
    expect(onQuickLog).not.toHaveBeenCalled();
  });

  it('omits the quick-log button when no onQuickLog handler is provided', () => {
    setup({ onQuickLog: undefined });
    expect(screen.getByText('Rice')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /quick log rice/i })
    ).not.toBeInTheDocument();
  });
});
