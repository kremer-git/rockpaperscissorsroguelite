// Store-gap curves. gap(n) = rounds the player must survive before store n+1.
// None of these are capped: that is the point. The simulator compares them
// (npm run sim:curves); CONFIG.curve selects the one the game uses.

export interface Curve {
  id: string;
  label: string;
  gap(n: number): number;
}

const fibMemo: number[] = [1, 2];
function fib(n: number): number {
  while (fibMemo.length <= n) fibMemo.push(fibMemo[fibMemo.length - 1] + fibMemo[fibMemo.length - 2]);
  return fibMemo[n];
}

export const CURVES: Curve[] = [
  { id: 'linear', label: 'Linear (3, 6, 9, 12…)', gap: (n) => 3 * (n + 1) },
  { id: 'fibonacci', label: 'Fibonacci (1, 2, 3, 5, 8, 13, 21…)', gap: (n) => fib(n) },
  { id: 'polynomial', label: 'Quadratic (2, 3, 6, 11, 18, 27…)', gap: (n) => n * n + 2 - (n === 0 ? 0 : 0) },
  { id: 'exponential', label: 'Exponential ×1.8 (2, 4, 6, 11, 21…)', gap: (n) => Math.round(2 * Math.pow(1.8, n)) },
  {
    id: 'tuned',
    label: 'Tuned (2, 3, 4, 6, 9, 14, 21, 32, 48, 72, 108…)',
    gap: (n) => (n < 4 ? [2, 3, 4, 6][n] : Math.round(6 * Math.pow(1.5, n - 3))),
  },
];

export function getCurve(id: string): Curve {
  return CURVES.find((c) => c.id === id) ?? CURVES[1];
}
