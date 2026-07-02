import { describe, it, expect } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('merges multiple class strings into one space-separated string', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('drops falsy values (false, null, undefined, 0, empty string)', () => {
    expect(cn('flex', false, null, undefined, 0, '', 'gap-2')).toBe('flex gap-2');
  });

  it('keeps a class from a truthy conditional', () => {
    expect(cn('p-2', true && 'p-4')).toBe('p-4');
  });

  it('drops a class from a falsy conditional', () => {
    expect(cn('text-red-500', false && 'x', 'text-blue-500')).toBe('text-blue-500');
  });

  it('de-dupes conflicting Tailwind padding utilities (later wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('resolves conflicting text color utilities keeping the last one (blue)', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('keeps non-conflicting utilities from different property groups', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
  });

  it('accepts arrays of classes', () => {
    expect(cn(['flex', 'gap-2'], 'p-4')).toBe('flex gap-2 p-4');
  });

  it('accepts object syntax where truthy keys are included', () => {
    expect(cn({ 'text-red-500': false, 'text-blue-500': true })).toBe('text-blue-500');
  });

  it('returns an empty string when given no arguments', () => {
    expect(cn()).toBe('');
  });

  it('returns an empty string when all inputs are falsy', () => {
    expect(cn(false, null, undefined, '')).toBe('');
  });
});
