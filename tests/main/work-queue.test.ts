import { expect, it } from 'vitest';
import { AsyncGate } from '../../src/main/work-queue';

it('bounds simultaneous media reads and drains queued reads after failure', async () => {
  const queue = new AsyncGate(4);
  let concurrent = 0;
  let peak = 0;
  let finished = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 40 }, (_, index) =>
      queue.run(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 1));
        concurrent -= 1;
        finished += 1;
        if (index === 2) throw new Error('Missing thumbnail');
        return index;
      }),
    ),
  );
  expect(peak).toBe(4);
  expect(concurrent).toBe(0);
  expect(finished).toBe(40);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(39);
});
