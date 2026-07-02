import { useState, useMemo } from 'react';
import { getLocalDate } from '../utils/date';
import {
  normalizeFoodData, convertQuantity,
  basisFromItem, basisFromLog, computeAmountMacros, buildFoodLog, getEditingLogId,
} from '../domain/foodMath';

// Owns the whole "add / scan / edit a food log" flow: which meal we're adding to,
// the item under review (scannedResult, carrying its immutable basis), the chosen
// amount/unit, the live macro calc, and the confirm/edit handlers. Extracted from
// Dashboard to shrink the god-component and keep the logging logic in one place.
export function useFoodLogging({ actions, viewDate, onLogged, onError }) {
  const [addingToMeal, setAddingToMeal] = useState(null);
  const [scannedResult, setScannedResult] = useState(null);
  const [numServings, setNumServings] = useState(1);
  const [servingUnit, setServingUnit] = useState('serving'); // 'serving' | 'g' | 'oz' | 'floz'

  const handleFoodSelect = (foodItem) => {
    const clean = normalizeFoodData(foodItem);
    const basis = basisFromItem(clean);
    setScannedResult({ ...clean, basis });
    setAddingToMeal(foodItem.targetMeal || addingToMeal);
    // Gram-scalable foods default to grams (amount scales macros); serving-only foods
    // (e.g. "1 serving", AI estimates) default to 1 serving so gram edits can't misbehave.
    if (basis.gramScalable) {
      setServingUnit('g');
      setNumServings(basis.baseGrams);
    } else {
      setServingUnit('serving');
      setNumServings(1);
    }
  };

  const calculationData = useMemo(() => {
    const basis = scannedResult?.basis;
    if (!basis) return { c: 0, p: 0, ca: 0, f: 0, baseWeight: null };
    const t = computeAmountMacros(basis, numServings, servingUnit);
    return { c: t.calories, p: t.protein, ca: t.carbs, f: t.fats, baseWeight: basis.gramScalable ? basis.baseGrams : null };
  }, [scannedResult, numServings, servingUnit]);

  const handleUnitChange = (newUnit) => {
    const basis = scannedResult?.basis;
    if (!basis) return;
    setNumServings(convertQuantity(numServings, servingUnit, newUnit, basis.baseGrams));
    setServingUnit(newUnit);
  };

  const handleScanConfirm = async () => {
    const basis = scannedResult?.basis;
    if (!basis) return;
    // Guard against a 0/blank amount (cleared input) writing a 0-cal ghost log.
    if (!(Number(numServings) > 0)) return;
    // Store the immutable basis + amount (+ recomputed totals). Editing later just reloads
    // the base and re-applies the amount — no reverse-engineering, no compounding labels.
    const payload = buildFoodLog(basis, numServings, servingUnit, { name: scannedResult.name || 'Unknown Food' });
    const dateStr = getLocalDate(viewDate);
    const mealType = addingToMeal || scannedResult.mealType;
    // Edit-vs-new is driven ONLY by the explicit marker set on the true edit path
    // (handleEditLog). Items from Recent/Saved/Popular have plain Firestore ids, so
    // inferring "edit" from the id misrouted them to updateFood on a foreign doc.
    const editingLogId = getEditingLogId(scannedResult);
    // Await the write so a FAILED write can't fire a false success toast.
    try {
      if (editingLogId) await actions.updateFood(editingLogId, payload, dateStr, mealType);
      else await actions.saveFood(payload, dateStr, mealType);
    } catch (err) {
      if (onError) onError(err, payload);
      return; // keep the modal open; do NOT clear state or report success
    }
    if (onLogged) onLogged(payload, !!editingLogId);
    setScannedResult(null);
    setAddingToMeal(null);
  };

  // One-tap re-log: log an item immediately at its stored portion (or 1 serving / its base
  // grams if it has none) without opening the confirm sheet. Used by Recent/Saved rows.
  const quickLog = async (foodItem, mealType) => {
    const clean = normalizeFoodData(foodItem);
    const basis = basisFromItem(clean);
    const quantity = Number(foodItem.quantity) > 0
      ? Number(foodItem.quantity)
      : (basis.gramScalable ? basis.baseGrams : 1);
    const unit = foodItem.unit || (basis.gramScalable ? 'g' : 'serving');
    const payload = buildFoodLog(basis, quantity, unit, { name: clean.name || 'Unknown Food' });
    const dateStr = getLocalDate(viewDate);
    try {
      await actions.saveFood(payload, dateStr, mealType);
    } catch (err) {
      if (onError) onError(err, payload);
      return;
    }
    if (onLogged) onLogged(payload, false);
  };

  const handleEditLog = (logItem) => {
    // basisFromLog reconstructs the immutable base + amount from the stored log, handling
    // both the new V2 schema and legacy V1 logs (already-scaled totals + a label string).
    const basis = basisFromLog(logItem);
    setNumServings(basis.quantity);
    setServingUnit(basis.unit);
    // __editingLogId is the ONLY signal that this confirm should update in place; it is
    // set here and nowhere else, so food-select items can never be misread as edits.
    setScannedResult({ name: logItem.name, id: logItem.id, __editingLogId: logItem.id, mealType: logItem.mealType, weight_amount: logItem.weight_amount, basis });
  };

  return {
    addingToMeal, setAddingToMeal,
    scannedResult, setScannedResult,
    numServings, setNumServings,
    servingUnit, setServingUnit,
    calculationData,
    handleFoodSelect, handleUnitChange, handleScanConfirm, handleEditLog, quickLog,
  };
}
