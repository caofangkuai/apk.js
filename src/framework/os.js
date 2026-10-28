export class Looper {
  constructor(vm) {
    this.vm = vm;
    this.queue = new MessageQueue(vm);
  }

  quit() {
    this.queue.clear();
  }

  quitSafely() {
    this.queue.clear();
  }
}

export class MessageQueue {
  constructor(vm) {
    this.vm = vm;
    this.tasks = new Set();
  }

  post(runnable, delay = 0, meta = null) {
    const task = {
      runnable,
      meta,
      cancelled: false,
      timer: null,
    };
    task.timer = setTimeout(() => {
      if (task.cancelled) return;
      this.tasks.delete(task);
      this.vm.runRunnable(task.runnable);
    }, Math.max(0, Number(delay) || 0));
    this.tasks.add(task);
    return task;
  }

  removeTask(task) {
    if (!task || task.cancelled) return;
    task.cancelled = true;
    if (task.timer !== null) clearTimeout(task.timer);
    this.tasks.delete(task);
  }

  removeWhere(predicate) {
    for (const task of [...this.tasks]) {
      if (predicate(task)) this.removeTask(task);
    }
  }

  clear() {
    for (const task of [...this.tasks]) this.removeTask(task);
  }

  isIdle() {
    return this.tasks.size === 0;
  }
}

function messageField(message, name, fallback = null) {
  if (message === null || message === undefined) return fallback;
  if (message.$peer && Object.prototype.hasOwnProperty.call(message.$peer, name)) {
    return message.$peer[name];
  }
  if (Object.prototype.hasOwnProperty.call(message, name)) return message[name];
  return fallback;
}

export class Handler {
  constructor(vm, looper = null, callback = null) {
    this.vm = vm;
    this.looper = looper || vm.mainLooper || null;
    this.callback = callback;
    this.tasks = new Set();
  }

  get queue() {
    return this.looper?.queue || this.vm.messageQueue;
  }

  enqueue(runnable, delay, meta = null) {
    const task = this.queue.post(runnable, delay, meta);
    this.tasks.add(task);
    return true;
  }

  post(runnable) {
    return this.postDelayed(runnable, 0);
  }

  postDelayed(runnable, delay = 0) {
    return this.enqueue(runnable, Number(delay) || 0);
  }

  postAtFrontOfQueue(runnable) {
    return this.post(runnable);
  }

  removeCallbacks(runnable) {
    for (const task of [...this.tasks]) {
      if (task.runnable === runnable) {
        this.queue.removeTask(task);
        this.tasks.delete(task);
      }
    }
  }

  removeMessages(what) {
    const expected = Number(what) | 0;
    for (const task of [...this.tasks]) {
      if (task.meta && (task.meta.what | 0) === expected) {
        this.queue.removeTask(task);
        this.tasks.delete(task);
      }
    }
  }

  removeCallbacksAndMessages(token) {
    for (const task of [...this.tasks]) {
      const matchesToken = token === null || token === undefined || task.meta?.obj === token;
      if (matchesToken) {
        this.queue.removeTask(task);
        this.tasks.delete(task);
      }
    }
  }

  sendMessage(message) {
    return this.sendMessageDelayed(message, 0);
  }

  sendMessageDelayed(message, delay = 0) {
    const callback = messageField(message, 'callback', null);
    if (callback) {
      return this.enqueue(() => this.vm.runRunnable(callback), delay);
    }
    const what = messageField(message, 'what', 0) | 0;
    return this.enqueue(() => this.dispatchMessage(message), delay, { what });
  }

  sendEmptyMessage(what) {
    return this.sendEmptyMessageDelayed(what, 0);
  }

  sendEmptyMessageDelayed(what, delay = 0) {
    const value = Number(what) | 0;
    const message = { what: value };
    return this.enqueue(() => this.dispatchMessage(message), delay, { what: value });
  }

  dispatchMessage(message) {
    const callback = messageField(message, 'callback', null);
    if (callback) {
      this.vm.runRunnable(callback);
      return;
    }
    this.vm.invokeHandlerMessage(this, message);
  }

  getLooper() {
    return this.looper;
  }
}

export class Message {
  constructor(vm) {
    this.vm = vm;
    this.what = 0;
    this.arg1 = 0;
    this.arg2 = 0;
    this.obj = null;
    this.callback = null;
    this.target = null;
  }

  toString() {
    return `Message{what=${this.what}}`;
  }
}
