import { logEvent } from 'firebase/analytics';
import { analytics } from './firebase';

// Fire a GA4 event if analytics is available (it initializes async + only where
// supported). Never throws — analytics must never break a user flow.
export const track = (name, params = {}) => {
  try {
    if (analytics) logEvent(analytics, name, params);
  } catch {
    /* no-op */
  }
};
