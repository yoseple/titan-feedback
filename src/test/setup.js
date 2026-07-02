// Vitest global setup. Registers @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveClass, etc.) for the component tests. Safe to load under the node environment too —
// it only extends `expect`. Component test files opt into the DOM via a per-file
// `// @vitest-environment jsdom` pragma.
import '@testing-library/jest-dom/vitest';
