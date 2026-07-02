// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MealCard from './MealCard.jsx';

// MealCard is a pure presentational card: it only reads from `meal` and calls the
// callback props. No Firebase/router/network involved, so nothing needs mocking.

const baseMeal = {
  id: 'meal-1',
  name: 'Grilled Chicken',
  calories: 420,
  // Component slices tags to the first two — provide three to prove it drops the rest.
  tags: ['high-protein', 'lean', 'quick'],
  ingredients: [{ name: 'Chicken Breast' }, { name: 'Olive Oil' }],
};

function setup(props = {}) {
  const onToggle = vi.fn();
  const onChefMode = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <MealCard
      meal={baseMeal}
      isSelected={false}
      onToggle={onToggle}
      onChefMode={onChefMode}
      onEdit={onEdit}
      onDelete={onDelete}
      {...props}
    />
  );
  return { ...utils, onToggle, onChefMode, onEdit, onDelete };
}

afterEach(() => cleanup());

describe('MealCard', () => {
  it('renders the meal name and calorie/macro summary', () => {
    setup();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    // Calories render as `{meal.calories} CAL` — the span's text is "420 CAL".
    expect(screen.getByText('420 CAL')).toBeInTheDocument();
  });

  it('renders at most the first two tags', () => {
    setup();
    expect(screen.getByText('high-protein')).toBeInTheDocument();
    expect(screen.getByText('lean')).toBeInTheDocument();
    // Third tag is sliced off and must not render.
    expect(screen.queryByText('quick')).not.toBeInTheDocument();
  });

  it('hides ingredients until the header is expanded', () => {
    setup();
    // Collapsed by default: the details section (ingredients) is not mounted.
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
    expect(screen.queryByText('Olive Oil')).not.toBeInTheDocument();

    // Clicking the header row (name bubbles to the row's onClick) expands it.
    fireEvent.click(screen.getByText('Grilled Chicken'));
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
    expect(screen.getByText('Olive Oil')).toBeInTheDocument();
  });

  it('collapses again on a second header click, re-hiding ingredients', () => {
    setup();
    const header = screen.getByText('Grilled Chicken');
    fireEvent.click(header);
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
  });

  it('calls onToggle from the select button without expanding the card', () => {
    const { onToggle } = setup();
    // Collapsed state has exactly one button: the select/toggle control.
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Its onClick stops propagation, so the card must stay collapsed.
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
  });

  it('calls onDelete with the meal id from the expanded actions', () => {
    const { onDelete, container } = setup();
    fireEvent.click(screen.getByText('Grilled Chicken')); // expand to reveal actions

    // Expanded DOM order of buttons: [0] select toggle, [1] edit, [2] delete, [3] chef mode.
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[2]);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('meal-1');
  });

  it('calls onEdit and onChefMode with the whole meal from the expanded actions', () => {
    const { onEdit, onChefMode, container } = setup();
    fireEvent.click(screen.getByText('Grilled Chicken'));

    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[1]); // edit
    expect(onEdit).toHaveBeenCalledWith(baseMeal);

    fireEvent.click(screen.getByText(/chef mode/i)); // chef mode button carries a label
    expect(onChefMode).toHaveBeenCalledWith(baseMeal);
  });
});
