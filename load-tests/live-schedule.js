// Shared by k6 and the offline tests; contains no k6/Node-specific APIs.
export function resumePlan(questionCount, mode = 'random', random = Math.random) {
  if (!Number.isInteger(questionCount) || questionCount < 2) throw new Error('Invalid question count');
  if (!['random', 'synchronized'].includes(mode)) throw new Error('Invalid resume mode');
  if (mode === 'synchronized') return { index: Math.floor(questionCount / 2) - 1, jitter: 0 };
  const first = Math.max(0, Math.floor(questionCount / 6) - 1);
  const last = Math.min(questionCount - 2, Math.ceil(questionCount * 5 / 6) - 1);
  const position = random(), jitter = random();
  if (![position, jitter].every(value => Number.isFinite(value) && value >= 0 && value < 1)) throw new Error('Invalid random value');
  return { index: first + Math.floor(position * (last - first + 1)), jitter };
}
