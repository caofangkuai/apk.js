import { Resources } from './resources.js';
import { DecorView, SurfaceScreen, Window } from './window.js';
import { LayoutInflater } from './layout-inflater.js';
import { viewObject, contextFacade } from './bridge.js';
import { MeasureSpec, measureDepth } from './view.js';

export class ActivityHost {
  constructor(vm, activityObject) {
    this.vm = vm;
    this.object = activityObject;
    this.screen = vm.screen || null;
    this.decorView = null;
    this.window = null;
    this.contentView = null;
    this.finished = false;
    this.title = '';
    this.intent = null;
  }

  ensureWindow() {
    if (this.window) return;
    const context = contextFacade(this.vm);
    this.decorView = new DecorView(context, this.screen);
    this.decorView.$scheduleLayout = () => {
      if (this._inLayout || measureDepth > 0) return;
      this._pendingRelayout = true;
      this._relayoutScheduled = true;
      const run = () => {
        this._relayoutScheduled = false;
        if (!this._pendingRelayout) return;
        this._pendingRelayout = false;
        this.relayout();
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(run);
      else setTimeout(run, 0);
    };
    this.decorView.$scheduleDraw = () => this.screen?.invalidate();
    this.decorView.attachedToWindow = true;
    this.decorView.__isScreenRoot = true;
    this.window = new Window(context, this.decorView, this.screen);
    this.window.host = this;
    this.window.callback = this.object;
    this.window.$javaObject = this.vm.wrapPeer({
      vm: this.vm,
      window: this.window,
      decorView: this.decorView,
      constructor: { $descriptor: 'Landroid/view/Window;' },
    });
    if (this.screen) this.screen.setDecorView(this.decorView);
  }

  relayout(force = false) {
    if (!this.decorView || !this.screen) return;
    if (this._inLayout) {
      this._pendingRelayout = true;
      return;
    }
    const layoutWidth = this.screen.width;
    const layoutHeight = this.screen.height;
    if (!force && !this._pendingRelayout && this._layoutSignature === layoutWidth + 'x' + layoutHeight) {
      return;
    }
    this._inLayout = true;
    try {
      let guard = 0;
      do {
        this._pendingRelayout = false;
        const width = this.screen.width;
        const height = this.screen.height;
        this._layoutSignature = width + 'x' + height;
        this.decorView.measure(
          MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
        );
        this.decorView.layout(0, 0, width, height);
      } while (this._pendingRelayout && ++guard < 8);
    } finally {
      this._inLayout = false;
    }
    this.screen.invalidate();
  }

  setContentView(viewOrObject) {
    let view = viewOrObject?.$view || viewOrObject;
    if (!view) return;
    if (typeof view.measure !== 'function' && viewOrObject?.$nativeClass) {
      const peer = this.vm?.registry?.getPeer?.(viewOrObject, viewOrObject.$nativeClass);
      if (peer?.view) view = peer.view;
    }
    if (typeof view.measure !== 'function') {
      this.vm?.log?.('warn', 'Activity', `setContentView 收到非视图对象: ${viewOrObject?.$nativeClass || viewOrObject?.constructor?.name || typeof view}`);
      return;
    }
    this.ensureWindow();
    this.contentView = view;
    this.window.setContentView(view);
    this._pendingRelayout = true;
  }

  findViewById(id) {
    const target = id >>> 0;
    if (target === 0x01020002) {
      this.ensureWindow();
      const host = this.window?.decorView?.contentHost;
      if (host) {
        if (host.$javaObject && host.$javaObject.$view !== host) host.$javaObject = null;
        return viewObject(this.vm, host);
      }
      return null;
    }
    if (!this.contentView) return null;
    const view = this.contentView.findViewById(target);
    return view ? viewObject(this.vm, view) : null;
  }

  getWindowObject() {
    this.ensureWindow();
    return this.window.$javaObject;
  }

  finish() {
    this.finished = true;
    this.vm.onActivityFinished?.(this);
  }

  getTitle() {
    return this.title;
  }

  setTitle(title) {
    this.title = title;
    this.screen?.invalidate();
  }

  getResources() {
    return this.vm.resources;
  }
}

export function inflateLayout(vm, resId, root = null, attach = false) {
  const inflater = new LayoutInflater(contextFacade(vm));
  return inflater.inflate(resId, root, attach);
}

export { Resources, SurfaceScreen, Window, DecorView };
