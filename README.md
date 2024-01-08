# Async Exec Pool

There are many modules like this one, but this one is mine. It's also:
- Low dependency - only has 1 dependency `chanty` which has no sub-dependencies
- Small - Only a single file under 100 lines
- Neat - You know it

## How to use

```TypeScript
// Some async function that could be run concurrently
const asyncFn = async (task: TaskType) => {/*...*/};

const pool = new Pool([task1, task2, task3, ..., task100], asyncFn);
await pool.processQueue(5);
```

The `Pool` constructor takes the list of tasks, which is whatever type you want. Each task element is passed directly to the input function (`asyncFn` in the example).

The pool is started by calling `pool.processQueue()` with the level of concurrency you want (default of 1 for serial processing, but that's boring). Once all the tasks have been passed to `asyncFn`, and all calls of `asyncFn` started by the pool have been resolved, only then will `pool.processQueue` resolve.

## The queue can grow

The challenge with this project was allowing the pool's queue to grow dynamically and only resolving the `processQueue` method after the pool becomes idle, meaning no workers running AND no tasks in the queue. Here's a silly little example that shows this in action:

```JavaScript
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
```

If you execute the above using `pnpm ts-node src/try.ts`, you will see this output:
```
[1] finished processing 2
[2] finished processing 4
[4] finished processing 2
[6] finished processing 2
[5] finished processing 4
[3] finished processing 12
[8] finished processing 4
[9] finished processing 2
[10] finished processing 4
[11] finished processing 2
[7] finished processing 11
[12] finished processing 4
[13] finished processing 5
This task was pushed dynamically!
[14] finished processing 5
This task was pushed dynamically!
```

The task list did not originally include any 5's, but they were added to the list while it was being processed, and so they show up as the final tasks to be evaluated.

## Methods

### `new Pool()`

The constructor. Accepts the list of tasks and an async function which accepts one task.

```TypeScript
interface MyTask {
  foo: number;
  bar: string;
}
const tasks: MyTask[] = [{ foo: 5, bar: 'hello' }, { foo: 12, bar: 'world' }];
const taskHandler = async (task: MyTask) => {/*...*/};

const pool = new Pool(tasks, taskHandler);
```

### `processQueue: (concurrency?: number) => Promise<void>`

Start the pool's task runner. This will fail if the processor is already running. After completion, the inner queue will be cleared, so to re-use a pool that has finished executing, you will have to pass your new tasks via `pool.pushTask` before calling `processQueue` again.

### `pushTask: (task: T) => Promise<void>`

Push a new task into the queue. If the pool is already running, it will eventually handle the new task too. If the pool was already run and has resolved before `pushTask` was called, then you will have to call `processQueue` again to re-start the pool.

Notice that `pushTask` returns a Promise. This is because all it's doing is calling the queue channel's `put` method internally. The promise returned from this method resolves after the message is taken from the channel, which in the context of the pool means that the task has started being processed by the task runner. Because of this, you should only `await pool.pushTask` when you want to specifically wait for that particular task to finish. Otherwise, if you just want to enqueue another task and keep going, just call it without resolving the Promise.

### `isIdle: () => boolean`

Check if the pool is currently idle (`true`) or running (`false`).

### `setConcurrencySize: (concurrencySize: number) => void`

Dynamically change the concurrency level of `processQueue` as it's executing. Seems useful, though I haven't fully tested this being called during the execution process. I feel like based on how I designed the idle checker, it should just work, but I'm not 100% on this one.
