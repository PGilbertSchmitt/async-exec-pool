import { Channel } from 'chanty';

type ExecutorFn<T> = (task: T) => Promise<void>;

// Now THAT's how you make a private variable
const QUEUE = Symbol('QUEUE');
const EXEC = Symbol('EXEC');
const SIZE = Symbol('SIZE');
const WORKERS = Symbol('WORKERS');
const WAIT = Symbol('WAIT');
const DONE = Symbol('DONE');

export class Pool<T> {
  private [QUEUE]: Channel<T>;
  private [EXEC]: ExecutorFn<T>;
  private [SIZE] = 1;
  private [WORKERS]: Set<number>;
  private [WAIT]: Promise<void> | null = null;
  private [DONE]: (() => void) | null = null;

  constructor(inputs: T[], executor: ExecutorFn<T>) {
    this[EXEC] = executor;
    this[QUEUE] = new Channel();
    this[WORKERS] = new Set();
    inputs.forEach(this.pushTask);
  }

  setConcurrencySize = (concurrencySize: number) => { this[SIZE] = concurrencySize };

  pushTask = async (task: T) => { await this[QUEUE].put(task); }

  isIdle = () =>
    this[QUEUE].sizeMessages() === 0 && this[WORKERS].size === 0;

  processQueue = async (concurrency?: number) => {
    if (concurrency) {
      this.setConcurrencySize(concurrency);
    }

    if (this[WAIT]) {
      throw new Error('The queue is already being processed');
    }

    this[WAIT] = new Promise(res => {
      this[DONE] = res;
    });

    this.grow();

    await this[WAIT];
    this[WAIT] = null;
  };

  // This needs to be synchronous in order to work properly
  private grow = () => {
    const queue = this[QUEUE];
    const workers = this[WORKERS];
    const fn = this[EXEC];

    let currentWorkerCount = 0;

    for (let i = 0; i < this[SIZE]; i++) {
      if (this.isIdle()) {
        continue;
      }

      currentWorkerCount++;

      if (!workers.has(i)) {
        // We know for a fact that there are messages in the Channel waiting to be taken.
        // Due to the design of Channel, even though the return of `take` is a promise,
        // it will synchronously remove the next message, so the message queue size will
        // shrink synchronously, so even though the `grow` function will continue to exectute
        // before the promise can resolve, `this.isIdle()` will still work.
        queue.take().then(async task => {
          workers.add(i);
          await fn(task);
          workers.delete(i);

          // This recursive step won't break the callstack because we've sidestepped it via `Promise.then()`
          this.grow();
        });
      }
    }

    if (currentWorkerCount === 0) {
      // We are done executing, so resolve
      const resolve = this[DONE];

      // Grow is synchronous, so I think this should not occur, but what do I know?
      if (resolve === null) {
        throw new Error('No resolve function registered, how did this happen?');
      }
      resolve();
      this[DONE] = null;
    }
  }
};
