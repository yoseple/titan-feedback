import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Merge conditional class lists and de-dupe conflicting Tailwind utilities
// (e.g. cn('p-2', cond && 'p-4') -> 'p-4'). Use for any variant styling so class
// strings stop being copy-pasted and drifting. clsx + tailwind-merge were already
// installed but unused.
export const cn = (...inputs) => twMerge(clsx(inputs));
