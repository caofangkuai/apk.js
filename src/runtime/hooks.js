/**
 * 轻量生命周期事件总线（load/start/log/activity:finish）。
 * 没有监听器时 emit 直接返回，不引入额外开销；方法拦截见 src/runtime/xposed.js。
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
   * 依次执行全部监听器，单个监听器抛错不影响其余监听器。
   * 生命周期事件只做通知，返回值不参与流程；方法拦截请用 Xposed API（`sim.xposed`）。
   */
  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers || !handlers.length) return undefined;
    for (const handler of handlers.slice()) {
      try {
        handler(payload, this);
      } catch (error) {
        // 监听器异常不应中断应用执行；交给宿主日志。
        if (typeof this.onError === 'function') this.onError(error, event);
        else if (typeof console !== 'undefined') console.error(`[apk.js event:${event}]`, error);
      }
    }
    return undefined;
  }
}

export function createHookBus(initial) {
  return initial instanceof HookBus ? initial : new HookBus(initial);
}
