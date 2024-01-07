import { Pool } from './pool';

(async () => {
  let i = 1;
  const tasks = [2,4,12,2,4,2,11,4,2,4,2,4];
  const pool = new Pool(tasks, async (x) => {
    const iter = i++;
    if (x > 10) {
      pool.pushTask(5);
    }
    await new Promise<void>(res => {
      setTimeout(() => {
        console.log(`[${iter}] finished processing ${x}`);
        if (x === 5) console.log('This task was pushed dynamically!');
        res();
      }, x * 100);
    });
  });

  await pool.processQueue(3);
})();