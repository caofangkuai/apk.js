/**
 * 轻量事件钩子总线。没有监听器时 emit 直接返回 undefined，不引入额外开销。
 */
export class HookBus {
  constructor(initial = null) {
    this._listeners = new Map();
    if (initial instanceof HookBus) {
      for (const [event, handlers] of initial._listeners) this._listeners.set(event, handlers.slice());
    } else if (initial && typeof initial === 'object') {
      for (const [event, handler] of Object.entries(initial)) {
        if (typeof handler === 'function') this.on(event, handler);
        else if (Array.isArray(handler)) for (const item of handler) if (typeof item === 'function') this.on(event, item);
      }
    }
  }

  on(event, handler) {
    if (typeof event !== 'string' || !event || typeof handler !== 'function') {
      throw new TypeError('hook 需要事件名和函数');
    }
    const handlers = this._listeners.get(event) || [];
    handlers.push(handler);
    this._listeners.set(event, handlers);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const dispose = this.on(event, (payload, context) => {
      dispose();
      return handler(payload, context);
    });
    return dispose;
  }

  off(event, handler) {
    const handlers = this._listeners.get(event);
    if (!handlers) return false;
    if (!handler) {
      this._listeners.delete(event);
      return true;
    }
    const index = handlers.indexOf(handler);
    if (index < 0) return false;
    handlers.splice(index, 1);
    if (!handlers.length) this._listeners.delete(event);
    return true;
  }

  clear(event) {
    if (event === undefined) this._listeners.clear();
    else this._listeners.delete(event);
  }

  has(event) {
    return (this._listeners.get(event)?.length || 0) > 0;
  }

  /**
   * 依次执行监听器。返回第一个非 undefined 的结果，供 before/after 钩子短路或替换返回值。
   */
  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers || !handlers.length) return undefined;
    for (const handler of handlers.slice()) {
      let result;
      try {
        result = handler(payload, this);
      } catch (error) {
        // 钩子异常不应中断应用执行；交给宿主日志。
        if (typeof this.onError === 'function') this.onError(error, event);
        else if (typeof console !== 'undefined') console.error(`[apk.js hook:${event}]`, error);
        continue;
      }
      if (result !== undefined) return result;
    }
    return undefined;
  }
}

export function hookResult(value) {
  return { __apkjsHookResult: true, value };
}

export function isHookResult(value) {
  return !!value && typeof value === 'object' && value.__apkjsHookResult === true;
}

export function createHookBus(initial) {
  return initial instanceof HookBus ? initial : new HookBus(initial);
}
