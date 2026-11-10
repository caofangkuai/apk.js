import { STATE, colorStateListColor, drawDrawable, drawablePadding, outlineRadius, setDrawableBounds, stateSetFor } from './drawables.js';

function viewObjectForOutline(vm, view) {
  const object = vm.allocateRawObject('Landroid/view/View;');
  object.$peer = { view };
  object.$nativeClass = 'Landroid/view/View;';
  object.$view = view;
  return object;
}

export const MeasureSpec = {
  UNSPECIFIED: 0,
  EXACTLY: 1 << 30,
  AT_MOST: 2 << 30,
  makeMeasureSpec(size, mode) {
    return (size & 0x3fffffff) | mode;
  },
  getMode(spec) {
    return spec & (3 << 30);
  },
  getSize(spec) {
    return spec & 0x3fffffff;
  },
  toString(spec) {
    const mode = MeasureSpec.getMode(spec);
    const size = MeasureSpec.getSize(spec);
    const name = mode === MeasureSpec.EXACTLY ? 'EXACTLY' : mode === MeasureSpec.AT_MOST ? 'AT_MOST' : 'UNSPECIFIED';
    return `MeasureSpec(${name}, ${size})`;
  },
};

export let measureDepth = 0;

export const VISIBILITY = { VISIBLE: 0, INVISIBLE: 4, GONE: 8 };
export const GONE_VALUES = new Set([2, 8]);

export function isGone(view) {
  return GONE_VALUES.has(view?.visibility);
}

function effectiveLayoutParams(child) {
  const base = child?.layoutParams || { width: -2, height: -2 };
  const overlay = child?.$layoutParamsObject?.$layoutParams;
  if (!overlay) return base;
  const merged = { ...base };
  for (const key of ['width', 'height', 'leftMargin', 'topMargin', 'rightMargin', 'bottomMargin', 'gravity', 'weight']) {
    if (overlay[key] !== undefined) merged[key] = overlay[key];
  }
  return merged;
}

export const MOTION_EVENT_DESCRIPTOR = 'Landroid/view/MotionEvent;';

const MOTION_ACTION_CODES = { down: 0, up: 1, move: 2, cancel: 3 };

export function motionActionCode(action) {
  if (typeof action === 'number') return action | 0;
  const text = String(action ?? '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(MOTION_ACTION_CODES, text)
    ? MOTION_ACTION_CODES[text]
    : 2;
}

export function motionActionName(action) {
  const code = typeof action === 'number' ? action & 0xff : motionActionCode(action);
  switch (code) {
    case 0:
      return 'down';
    case 1:
      return 'up';
    case 3:
      return 'cancel';
    default:
      return 'move';
  }
}

export function isMotionEventObject(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    value.$nativeClass === MOTION_EVENT_DESCRIPTOR ||
    value.$runtimeClass?.descriptor === MOTION_EVENT_DESCRIPTOR ||
    value.$dexClass?.descriptor === MOTION_EVENT_DESCRIPTOR
  );
}

export function createMotionEventObject(vm, init = {}) {
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const action = motionActionCode(init.action);
  const x = Number(init.x) || 0;
  const y = Number(init.y) || 0;
  const now = Date.now();
  const downTime = init.downTime !== undefined && init.downTime !== null
    ? Number(init.downTime) || 0
    : now;
  const eventTime = init.eventTime !== undefined && init.eventTime !== null
    ? Number(init.eventTime) || 0
    : now;
  const object = vm.allocateRawObject(MOTION_EVENT_DESCRIPTOR);
  object.$peer = {
    action,
    x,
    y,
    rawX: init.rawX !== undefined && init.rawX !== null ? Number(init.rawX) || 0 : x,
    rawY: init.rawY !== undefined && init.rawY !== null ? Number(init.rawY) || 0 : y,
    downTime,
    eventTime,
    edgeFlags: Number(init.edgeFlags) || 0,
    source: Number(init.source) || 0,
    pointerCount: Number(init.pointerCount) || 1,
    axisValues: init.axisValues && typeof init.axisValues === 'object' ? init.axisValues : null,
  };
  return object;
}

export function toMotionEventObject(vm, event) {
  if (isMotionEventObject(event)) return event;
  return createMotionEventObject(vm, event || {});
}

export function toHostTouchEvent(event) {
  if (!isMotionEventObject(event)) return event || { action: 'move', x: 0, y: 0 };
  const peer = event.$peer || {};
  const x = Number(peer.x) || 0;
  const y = Number(peer.y) || 0;
  return {
    action: typeof peer.action === 'string' ? peer.action : motionActionName(peer.action),
    x,
    y,
    rawX: peer.rawX !== undefined && peer.rawX !== null ? Number(peer.rawX) || 0 : x,
    rawY: peer.rawY !== undefined && peer.rawY !== null ? Number(peer.rawY) || 0 : y,
    downTime: peer.downTime,
    eventTime: peer.eventTime,
  };
}

export const GRAVITY = {
  TOP: 0x30,
  BOTTOM: 0x50,
  CENTER_VERTICAL: 0x10,
  LEFT: 0x03,
  RIGHT: 0x05,
  CENTER_HORIZONTAL: 0x01,
  CENTER: 0x11,
  START: 0x00800003,
  END: 0x00800005,
};

export const HORIZONTAL = 0;
export const VERTICAL = 1;

export class View {
  getDensity() {
    if (this.$density) return this.$density;
    const vm = this.vm || this.$vm;
    const d = vm?.resources?.density;
    if (typeof d === 'number' && d > 0) return d;
    return 1;
  }

  constructor(context = null) {
    this.vm = context?.vm || context?.$vm || null;
    this.context = context;
    this.parent = null;
    this.children = [];
    this.id = 0;
    this.visibility = VISIBILITY.VISIBLE;
    this.enabled = true;
    this.clickable = false;
    this.focusable = false;
    this.pressed = false;
    this.alpha = 1;
    this.background = null;
    this.foreground = null;
    this.foregroundGravity = 0x800033;
    this.backgroundTint = null;
    this.backgroundTintList = null;
    this.backgroundTintMode = null;
    this.paddingLeft = 0;
    this.paddingTop = 0;
    this.paddingRight = 0;
    this.paddingBottom = 0;
    this.layoutParams = null;
    this.left = 0;
    this.top = 0;
    this.right = 0;
    this.bottom = 0;
    this.measuredWidth = 0;
    this.measuredHeight = 0;
    this.measuredWidthState = -1;
    this.measuredHeightState = -1;
    this.translationX = 0;
    this.translationY = 0;
    this.elevation = 0;
    this.tag = null;
    this.listeners = { click: null, longClick: null, touch: null, focus: null };
    this.minWidth = 0;
    this.minHeight = 0;
    this.invalidateScheduled = false;
    this.clickRipple = 0;
    this.animationFrame = null;
    this.scaleX = 1;
    this.scaleY = 1;
    this.rotation = 0;
    this.rotationX = 0;
    this.rotationY = 0;
    this.pivotX = 0.5;
    this.pivotY = 0.5;
    this.pivotXExplicit = false;
    this.pivotYExplicit = false;
    this.translationZ = 0;
    this.scrollX = 0;
    this.scrollY = 0;
    this.selected = false;
    this.activated = false;
    this.pressed = false;
    this.longClickable = false;
    this.fitsSystemWindows = false;
    this.focusableInTouchMode = false;
    this.accessibilityLiveRegion = 0;
    this.importantForAccessibility = 0;
    this.nestedScrollingEnabled = false;
    this.isLayoutRequested = false;
    this.animation = null;
    this.onLayoutChangeListeners = [];
    this.onAttachStateListeners = [];
    this.onTouchListener = null;
    this.onHoverListener = null;
    this.onFocusChangeListener = null;
    this.tooltipText = null;
    this.contentDescription = null;
    this.labelFor = 0;
    this.layerType = 0;
    this.layoutDirection = -1;
    this.overScrollMode = 1;
    this.subtreeAccessibilityEnabled = false;
  }

  getId() {
    return this.id;
  }

  setId(id) {
    this.id = id;
    return this;
  }

  getContext() {
    return this.context;
  }

  getParent() {
    return this.parent;
  }

  getRootView() {
    let node = this;
    while (node.parent) node = node.parent;
    return node;
  }

  setBackgroundColor(color) {
    this.background = { color: color >>> 0, type: 'color' };
    this.invalidate();
    return this;
  }

  setBackground(background) {
    this.background = background;
    this.refreshDrawableState();
    this.invalidate();
    return this;
  }

  getBackground() {
    return this.background;
  }

  setForeground(foreground) {
    this.foreground = foreground;
    this.invalidate();
    return this;
  }

  getForeground() {
    return this.foreground ?? null;
  }

  setForegroundGravity(gravity) {
    this.foregroundGravity = gravity | 0;
    this.invalidate();
    return this;
  }

  getForegroundGravity() {
    return this.foregroundGravity ?? 0x800033;
  }

  setBackgroundTintList(color) {
    this.backgroundTintList = color;
    this.backgroundTint = typeof color === 'number' ? color >>> 0 : null;
    this.invalidate();
    return this;
  }

  getBackgroundTintList() {
    return this.backgroundTintList ?? null;
  }

  setBackgroundTintMode(mode) {
    this.backgroundTintMode = mode;
    this.invalidate();
    return this;
  }

  getBackgroundTintMode() {
    return this.backgroundTintMode ?? null;
  }

  setVisibility(visibility) {
    this.visibility = visibility;
    if (this.parent) {
      this.parent.requestLayout();
      this.parent.invalidate();
    }
    return this;
  }

  getVisibility() {
    return this.visibility;
  }

  isShown() {
    if (this.visibility !== VISIBILITY.VISIBLE) return false;
    return this.parent ? this.parent.isShown() : true;
  }

  setEnabled(enabled) {
    const next = !!enabled;
    if (this.enabled === next) return this;
    this.enabled = next;
    this.refreshDrawableState();
    return this;
  }

  isEnabled() {
    return this.enabled;
  }

  setClickable(clickable) {
    this.clickable = !!clickable;
    return this;
  }

  isClickable() {
    return this.clickable;
  }

  setFocusable(focusable) {
    this.focusable = !!focusable;
    return this;
  }

  setAlpha(alpha) {
    this.alpha = Math.max(0, Math.min(1, Number(alpha)));
    this.invalidate();
    return this;
  }

  getAlpha() {
    return this.alpha;
  }

  setTranslationX(value) {
    this.translationX = Number(value) || 0;
    this.invalidate();
    return this;
  }

  setTranslationY(value) {
    this.translationY = Number(value) || 0;
    this.invalidate();
    return this;
  }

  setTag(tag, key) {
    if (key === undefined) {
      this.tag = tag;
      return this;
    }
    if (!this.tags) this.tags = new Map();
    this.tags.set(key >>> 0, tag);
    return this;
  }

  getTag(key) {
    if (key === undefined) return this.tag;
    return this.tags ? this.tags.get(key >>> 0) : undefined;
  }

  setOnClickListener(listener) {
    this.listeners.click = listener;
    this.clickable = !!listener;
    return this;
  }

  setOnLongClickListener(listener) {
    this.listeners.longClick = listener;
    return this;
  }

  setOnTouchListener(listener) {
    this.listeners.touch = listener;
    return this;
  }

  setOnFocusChangeListener(listener) {
    this.listeners.focus = listener;
    return this;
  }

  hasOnClickListener() {
    return !!this.listeners.click;
  }

  performClick() {
    if (!this.$inPerformClick) {
      const vm = this.$vm;
      const obj = this.$javaObject;
      const descriptor = this.$descriptor || obj?.$nativeClass;
      const dexClass = vm && obj && descriptor ? vm.registry.resolve(descriptor)?.dexClass : null;
      const overrides = dexClass
        ? [...(dexClass.virtualMethods || []), ...(dexClass.directMethods || [])].find(
            (m) => m.name === 'performClick' && m.proto?.descriptor === '()Z',
          )
        : null;
      if (overrides) {
        this.$inPerformClick = true;
        try {
          const result = vm.executeMethod(overrides, obj, []);
          return typeof result === 'number' ? result !== 0 : !!result;
        } catch (error) {
          if (!error?.javaException && error?.name !== 'VMRuntimeError') throw error;
        } finally {
          this.$inPerformClick = false;
        }
        return false;
      }
    }
    this.$inPerformClick = false;
    if (this.listeners.click) {
      this.listeners.click(this, this);
      return true;
    }
    return false;
  }

  performLongClick() {
    if (this.listeners.longClick) {
      this.listeners.longClick(this);
      return true;
    }
    return false;
  }

  callOnClick() {
    return this.performClick();
  }

  setPadding(left, top, right, bottom) {
    this.paddingLeft = left;
    this.paddingTop = top;
    this.paddingRight = right;
    this.paddingBottom = bottom;
    this.requestLayout();
    return this;
  }

  setPaddingRelative(start, top, end, bottom) {
    return this.setPadding(start, top, end, bottom);
  }

  getPaddingLeft() {
    return this.paddingLeft;
  }

  getPaddingTop() {
    return this.paddingTop;
  }

  getPaddingRight() {
    return this.paddingRight;
  }

  getPaddingBottom() {
    return this.paddingBottom;
  }

  setMinimumWidth(width) {
    this.minWidth = width;
    return this;
  }

  setMinimumHeight(height) {
    this.minHeight = height;
    return this;
  }

  getMinimumWidth() {
    return this.minWidth;
  }

  getMinimumHeight() {
    return this.minHeight;
  }

  setLayoutParams(params) {
    this.layoutParams = params;
    if (this.parent) this.parent.requestLayout();
    return this;
  }

  getLayoutParams() {
    return this.layoutParams;
  }

  requestLayout() {
    const root = this.getRootView();
    if (root && root.$scheduleLayout) root.$scheduleLayout();
    else this.invalidate();
    return this;
  }

  isLayoutRequested() {
    return !!this.$layoutRequested;
  }

  invalidate() {
    const root = this.getRootView();
    if (root && root.$scheduleDraw) root.$scheduleDraw();
  }

  postInvalidate() {
    this.invalidate();
  }

  postInvalidateDelayed(delay) {
    setTimeout(() => this.invalidate(), delay);
  }

  getWidth() {
    return this.right - this.left;
  }

  getHeight() {
    return this.bottom - this.top;
  }

  getLeft() {
    return this.left;
  }

  getTop() {
    return this.top;
  }

  getRight() {
    return this.right;
  }

  getBottom() {
    return this.bottom;
  }

  getMeasuredWidth() {
    return this.measuredWidth;
  }

  getMeasuredHeight() {
    return this.measuredHeight;
  }

  setX(x) {
    this.setTranslationX(x - this.left);
  }

  setY(y) {
    this.setTranslationY(y - this.top);
  }

  getX() {
    return this.left + this.translationX;
  }

  getY() {
    return this.top + this.translationY;
  }

  getLocationOnScreen(out) {
    let x = 0;
    let y = 0;
    let node = this;
    while (node) {
      x += node.left + node.translationX;
      y += node.top + node.translationY;
      node = node.parent;
    }
    if (out) {
      out[0] = x;
      out[1] = y;
    }
    return out;
  }

  getLocationInWindow(out) {
    return this.getLocationOnScreen(out);
  }

  addChildrenForAccessibility() {
    return this.children;
  }

  getScrollX() {
    return this.scrollX;
  }

  getScrollY() {
    return this.scrollY;
  }

  scrollTo(x, y) {
    if (this.scrollX !== x || this.scrollY !== y) {
      this.scrollX = x | 0;
      this.scrollY = y | 0;
      this.invalidate();
    }
    return this;
  }

  scrollBy(x, y) {
    return this.scrollTo(this.scrollX + x, this.scrollY + y);
  }

  setScaleX(value) {
    this.scaleX = Number(value) || 0;
    this.invalidate();
    return this;
  }

  getScaleX() {
    return this.scaleX;
  }

  setScaleY(value) {
    this.scaleY = Number(value) || 0;
    this.invalidate();
    return this;
  }

  getScaleY() {
    return this.scaleY;
  }

  setRotation(value) {
    this.rotation = Number(value) || 0;
    this.invalidate();
    return this;
  }

  getRotation() {
    return this.rotation;
  }

  setRotationX(value) {
    this.rotationX = Number(value) || 0;
    this.invalidate();
    return this;
  }

  getRotationX() {
    return this.rotationX;
  }

  setRotationY(value) {
    this.rotationY = Number(value) || 0;
    this.invalidate();
    return this;
  }

  getRotationY() {
    return this.rotationY;
  }

  setPivotX(value) {
    this.pivotX = value;
    this.pivotXExplicit = true;
    this.invalidate();
    return this;
  }

  getPivotX() {
    return this.pivotXExplicit ? this.pivotX : this.getWidth() / 2;
  }

  setPivotY(value) {
    this.pivotY = value;
    this.pivotYExplicit = true;
    this.invalidate();
    return this;
  }

  getPivotY() {
    return this.pivotYExplicit ? this.pivotY : this.getHeight() / 2;
  }

  setTranslationZ(value) {
    this.translationZ = Number(value) || 0;
    this.invalidate();
    return this;
  }

  getTranslationZ() {
    return this.translationZ;
  }

  getTranslationX() {
    return this.translationX;
  }

  getTranslationY() {
    return this.translationY;
  }

  setElevation(value) {
    this.elevation = Number(value) || 0;
    if (this.parent) this.parent.$zOrder = null;
    this.invalidate();
    return this;
  }

  getElevation() {
    return this.elevation;
  }

  getZ() {
    return this.elevation + this.translationZ;
  }

  setSelected(selected) {
    const next = !!selected;
    if (this.selected === next) return this;
    this.selected = next;
    this.refreshDrawableState();
    return this;
  }

  isSelected() {
    return this.selected;
  }

  setActivated(activated) {
    const next = !!activated;
    if (this.activated === next) return this;
    this.activated = next;
    this.refreshDrawableState();
    return this;
  }

  isActivated() {
    return this.activated;
  }

  setPressed(pressed) {
    const next = !!pressed;
    if (this.pressed === next) return this;
    this.pressed = next;
    this.refreshDrawableState();
    return this;
  }

  isPressed() {
    return this.pressed;
  }

  setLongClickable(longClickable) {
    this.longClickable = !!longClickable;
    return this;
  }

  isLongClickable() {
    return this.longClickable;
  }

  setFitsSystemWindows(fits) {
    this.fitsSystemWindows = !!fits;
    return this;
  }

  getFitsSystemWindows() {
    return this.fitsSystemWindows;
  }

  setAccessibilityLiveRegion(region) {
    this.accessibilityLiveRegion = region | 0;
  }

  getAccessibilityLiveRegion() {
    return this.accessibilityLiveRegion;
  }

  setImportantForAccessibility(mode) {
    this.importantForAccessibility = mode | 0;
  }

  getImportantForAccessibility() {
    return this.importantForAccessibility;
  }

  setNestedScrollingEnabled(enabled) {
    this.nestedScrollingEnabled = !!enabled;
  }

  isNestedScrollingEnabled() {
    return this.nestedScrollingEnabled;
  }

  setTooltipText(text) {
    this.tooltipText = text;
  }

  getTooltipText() {
    return this.tooltipText;
  }

  setContentDescription(text) {
    this.contentDescription = text;
  }

  getContentDescription() {
    return this.contentDescription;
  }

  setLabelFor(id) {
    this.labelFor = id >>> 0;
  }

  getLabelFor() {
    return this.labelFor;
  }

  setLayerType(layerType, paint) {
    this.layerType = layerType | 0;
  }

  getLayerType() {
    return this.layerType;
  }

  setLayoutDirection(direction) {
    this.layoutDirection = direction | 0;
  }

  getLayoutDirection() {
    return this.layoutDirection < 0 ? 0 : this.layoutDirection;
  }

  setOverScrollMode(mode) {
    this.overScrollMode = mode | 0;
  }

  getOverScrollMode() {
    return this.overScrollMode;
  }

  setOnTouchListener(listener) {
    this.onTouchListener = listener;
    return this;
  }

  setOnHoverListener(listener) {
    this.onHoverListener = listener;
    return this;
  }

  setOnFocusChangeListener(listener) {
    this.onFocusChangeListener = listener;
    return this;
  }

  addOnLayoutChangeListener(listener) {
    if (listener && !this.onLayoutChangeListeners.includes(listener)) {
      this.onLayoutChangeListeners.push(listener);
    }
  }

  removeOnLayoutChangeListener(listener) {
    const index = this.onLayoutChangeListeners.indexOf(listener);
    if (index >= 0) this.onLayoutChangeListeners.splice(index, 1);
  }

  addOnAttachStateChangeListener(listener) {
    if (listener && !this.onAttachStateListeners.includes(listener)) {
      this.onAttachStateListeners.push(listener);
    }
  }

  removeOnAttachStateChangeListener(listener) {
    const index = this.onAttachStateListeners.indexOf(listener);
    if (index >= 0) this.onAttachStateListeners.splice(index, 1);
  }

  getVisibilityRaw() {
    return this.visibility;
  }

  getMeasuredState() {
    return (this.measuredWidthState & 0xff000000) | (this.measuredHeightState & 0xff000000);
  }

  getMeasuredWidthAndState() {
    return this.measuredWidth | (this.measuredWidthState & 0xff000000);
  }

  getMeasuredHeightAndState() {
    return this.measuredHeight | (this.measuredHeightState & 0xff000000);
  }

  getBaseline() {
    return -1;
  }

  isLayoutRequestedFlag() {
    return this.isLayoutRequested;
  }

  isLaidOut() {
    return this.width > 0 && this.height > 0;
  }

  getViewTreeObserver() {
    if (!this.viewTreeObserver) {
      this.viewTreeObserver = {
        addOnGlobalLayoutListener: () => undefined,
        addOnGlobalLayoutListenerOnMainThread: () => undefined,
        removeOnGlobalLayoutListener: () => undefined,
        addOnPreDrawListener: () => undefined,
        removeOnPreDrawListener: () => undefined,
        addOnDrawListener: () => undefined,
        removeOnDrawListener: () => undefined,
        addOnScrollChangedListener: () => undefined,
        removeOnScrollChangedListener: () => undefined,
        addOnTouchModeChangeListener: () => undefined,
        removeOnTouchModeChangeListener: () => undefined,
        isAlive: () => true,
        dispatchOnGlobalLayout: () => undefined,
        dispatchOnPreDraw: () => true,
        dispatchOnDraw: () => undefined,
      };
    }
    return this.viewTreeObserver;
  }

  getDrawingRect(out) {
    if (out) {
      out[0] = this.scrollX;
      out[1] = this.scrollY;
      out[2] = this.scrollX + this.width;
      out[3] = this.scrollY + this.height;
    }
    return out;
  }

  getGlobalVisibleRect(out, offset) {
    this.getLocationOnScreen(offset);
    if (out) {
      out[0] = offset ? offset[0] : 0;
      out[1] = offset ? offset[1] : 0;
      out[2] = out[0] + this.width;
      out[3] = out[1] + this.height;
    }
    return true;
  }

  getLocalVisibleRect(out) {
    if (out) {
      out[0] = 0;
      out[1] = 0;
      out[2] = this.width;
      out[3] = this.height;
    }
    return true;
  }

  getWindowVisibleDisplayFrame(out) {
    if (out) {
      out[0] = 0;
      out[1] = 0;
      out[2] = this.rootWidth || this.measuredWidth;
      out[3] = this.rootHeight || this.measuredHeight;
    }
    return out;
  }

  getDisplay() {
    return this.context?.getDisplay?.() || null;
  }

  getWindowToken() {
    let node = this;
    while (node.parent) node = node.parent;
    const attached = node.attachedToWindow === true || node.__isScreenRoot === true || node.__windowAttached === true;
    if (!attached) return null;
    if (!node.windowToken) {
      node.windowToken = { $descriptor: 'Landroid/os/IBinder;' };
    }
    return node.windowToken;
  }

  getApplicationWindowToken() {
    return this.getWindowToken();
  }

  isAttachedToWindowFlag() {
    let node = this;
    while (node.parent) node = node.parent;
    return node.attachedToWindow === true;
  }

  hasFocus() {
    return this.focused === true;
  }

  isFocused() {
    return this.focused === true;
  }

  requestFocus() {
    if (!this.focusable) return false;
    let root = this.getRootView();
    if (root && root.clearFocusTree) root.clearFocusTree(this);
    this.focused = true;
    this.invalidate();
    return true;
  }

  clearFocus() {
    if (this.focused) {
      this.focused = false;
      this.invalidate();
    }
  }

  isFocusable() {
    return this.focusable;
  }

  hasFocusable() {
    return this.focusable;
  }

  offsetTopAndBottom(offset) {
    const delta = offset | 0;
    this.top += delta;
    this.bottom += delta;
    if (typeof this.onOffsetChanged === 'function') this.onOffsetChanged(0, delta);
  }

  offsetLeftAndRight(offset) {
    const delta = offset | 0;
    this.left += delta;
    this.right += delta;
  }

  setScrollX(value) {
    this.scrollTo(value | 0, this.scrollY);
  }

  setScrollY(value) {
    this.scrollTo(this.scrollX, value | 0);
  }

  findViewWithTag(tag) {
    if (this.tag === tag) return this;
    for (const child of this.children) {
      const found = child.findViewWithTag(tag);
      if (found) return found;
    }
    return null;
  }

  findViewById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findViewById(id);
      if (found) return found;
    }
    return null;
  }

  measure(widthSpec, heightSpec) {
    measureDepth++;
    try {
      if (this.measureWithDex(widthSpec, heightSpec)) {
        this.applyMinimumMeasuredSize(widthSpec, heightSpec);
        return;
      }
      this.onMeasure(widthSpec, heightSpec);
      this.applyMinimumMeasuredSize(widthSpec, heightSpec);
    } finally {
      measureDepth--;
    }
  }

  applyMinimumMeasuredSize(widthSpec, heightSpec) {
    const minWidth = Number(this.minWidth) || 0;
    const minHeight = Number(this.minHeight) || 0;
    if (minWidth <= 0 && minHeight <= 0) return;
    const widthMode = widthSpec & 0xc0000000;
    const heightMode = heightSpec & 0xc0000000;
    const widthSize = widthSpec & 0x3fffffff;
    const heightSize = heightSpec & 0x3fffffff;
    let width = this.measuredWidth;
    let height = this.measuredHeight;
    if (minWidth > width) width = widthMode === 0x80000000 ? Math.min(minWidth, widthSize) : (widthMode === 0 ? minWidth : width);
    if (minHeight > height) height = heightMode === 0x80000000 ? Math.min(minHeight, heightSize) : (heightMode === 0 ? minHeight : height);
    if (width !== this.measuredWidth || height !== this.measuredHeight) {
      this.setMeasuredDimension(width, height);
      for (const child of this.children || []) {
        const lp = child.layoutParams;
        if (!lp || lp.height !== -1) continue;
        const margins = (lp.topMargin || 0) + (lp.bottomMargin || 0);
        const target = Math.max(0, height - this.paddingTop - this.paddingBottom - margins);
        child.measure(
          MeasureSpec.makeMeasureSpec(child.getMeasuredWidth(), MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(target, MeasureSpec.EXACTLY),
        );
      }
    }
  }

  measureWithDex(widthSpec, heightSpec) {
    const vm = this.vm || this.$vm;
    const object = this.$javaObject;
    const descriptor = this.$descriptor;
    if (!vm || !object || !descriptor || typeof vm.findVirtual !== 'function') return false;
    if (this.$preferHostMeasure) return false;
    if (this.$jsMeasureHandled) return false;
    let resolved;
    try {
      resolved = vm.findVirtual(descriptor, 'onMeasure', '(II)V');
    } catch (e) {
      return false;
    }

    if (!resolved || resolved.kind !== 'dex') return false;
    const ref = resolved.method;
    this.$jsMeasureHandled = true;
    try {
      vm.invoke(
        { classDesc: descriptor, name: 'onMeasure', proto: ref.proto },
        object,
        [widthSpec, heightSpec],
        'virtual'
      );
      return true;
    } catch (e) {
      return false;
    } finally {
      this.$jsMeasureHandled = false;
    }
  }

  onMeasure(widthSpec, heightSpec) {
    this.setMeasuredDimension(
      getDefaultSize(this.minWidth, widthSpec),
      getDefaultSize(this.minHeight, heightSpec)
    );
  }

  getDefaultSize(size, spec) {
    let result = size;
    const specMode = MeasureSpec.getMode(spec);
    const specSize = MeasureSpec.getSize(spec);
    switch (specMode) {
      case MeasureSpec.UNSPECIFIED:
        result = size;
        break;
      case MeasureSpec.AT_MOST:
      case MeasureSpec.EXACTLY:
        result = specSize;
        break;
    }
    return result;
  }

  setMeasuredDimension(width, height) {
    const MEASURED_SIZE_MASK = 0x00ffffff;
    this.measuredWidth = width & MEASURED_SIZE_MASK;
    this.measuredHeight = height & MEASURED_SIZE_MASK;
    this.measuredWidthState = width;
    this.measuredHeightState = height;
  }

  layout(left, top, right, bottom) {
    const changed = this.left !== left || this.top !== top || this.right !== right || this.bottom !== bottom;
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    if (this.layoutWithDex(changed, left, top, right, bottom)) return;
    this.onLayout(changed, left, top, right, bottom);
  }

  layoutWithDex(changed, left, top, right, bottom) {
    const vm = this.vm || this.$vm;
    const object = this.$javaObject;
    const descriptor = this.$descriptor;
    if (!vm || !object || !descriptor || typeof vm.findVirtual !== 'function') return false;
    if (this.$preferHostLayout) return false;
    if (this.$jsLayoutHandled) return false;
    let resolved;
    try {
      resolved = vm.findVirtual(descriptor, 'onLayout', '(ZIIII)V');
    } catch {
      return false;
    }

    if (!resolved || resolved.kind !== 'dex') return false;
    const ref = resolved.method;
    this.$jsLayoutHandled = true;
    try {
      for (const child of this.children) child.$relayoutBase = { left: child.left, top: child.top };
      vm.invoke(
        { classDesc: descriptor, name: 'onLayout', proto: ref.proto },
        object,
        [changed ? 1 : 0, left, top, right, bottom],
        'virtual'
      );
      for (const child of this.children) delete child.$relayoutBase;
      return true;
    } catch (e) {
      return false;
    } finally {
      this.$jsLayoutHandled = false;
    }
  }

  onLayout(changed, left, top, right, bottom) {}

  $shouldDexComputeScroll() {
    if (this.$dexComputeScroll !== undefined) return this.$dexComputeScroll;
    this.$dexComputeScroll = false;
    const vm = this.vm || this.$vm;
    const descriptor = this.$descriptor;
    if (!vm || !descriptor || !this.$javaObject || typeof vm.findVirtual !== 'function') return false;
    try {
      const res = vm.findVirtual(descriptor, 'computeScroll', '()V');
      this.$dexComputeScroll = !!(res && res.kind === 'dex');
    } catch {
      this.$dexComputeScroll = false;
    }
    return this.$dexComputeScroll;
  }

  computeScrollWithDex() {
    if (!this.$shouldDexComputeScroll()) return;
    const vm = this.vm || this.$vm;
    try {
      vm.invoke(
        { classDesc: this.$descriptor, name: 'computeScroll', proto: { descriptor: '()V', parameters: [], returnType: 'V' } },
        this.$javaObject,
        [],
        'virtual',
      );
    } catch {
      this.$dexComputeScroll = false;
    }
  }

  dexDrawOverride() {
    const vm = this.vm || this.$vm;
    const descriptor = this.$descriptor;
    if (!vm || !descriptor || typeof vm.findVirtual !== 'function') return null;
    try {
      const resolved = vm.findVirtual(descriptor, 'draw', '(Landroid/graphics/Canvas;)V');
      return resolved && resolved.kind === 'dex' ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  draw(canvas) {
    if (this.visibility !== VISIBILITY.VISIBLE) return;
    this.computeScrollWithDex();
    if (this.$dexDrawActive) {
      // 来自 DEX 覆写 draw() 的 super 调用：画布已经定位到本 View，直接走宿主管线。
      this.$dexDrawSawSuper = true;
      this.drawElevation(canvas);
      this.drawBackground(canvas);
      if (!this.drawWithDex(canvas)) {
        this.onDraw(canvas);
        this.dispatchDraw(canvas);
      }
      this.drawForeground(canvas);
      return;
    }
    const offsetX = this.left;
    const offsetY = this.top;
    canvas.save();
    canvas.translate(offsetX + this.translationX, offsetY + this.translationY);
    const alpha = this.alpha;
    if (alpha < 1) canvas.context.globalAlpha = alpha;

    const handlePipeline = () => {
      this.drawElevation(canvas);
      this.drawBackground(canvas);
      if (!this.drawWithDex(canvas)) {
        this.onDraw(canvas);
        this.dispatchDraw(canvas);
      }
      this.drawForeground(canvas);
    };

    if (this.$dexDrawActive) {
      this.$dexDrawSawSuper = true;
      handlePipeline();
    } else {
      const dexDraw = this.dexDrawOverride();
      if (dexDraw) {
        const vm = this.vm || this.$vm;
        this.$dexDrawActive = true;
        this.$dexDrawSawSuper = false;
        try {
          vm.invoke(
            { classDesc: this.$descriptor, name: 'draw', proto: dexDraw.method.proto },
            this.$javaObject,
            [this.canvasObject(canvas)],
            'virtual',
          );
        } catch (_) {
          // 绘制失败时仍保留宿主管线
        } finally {
          this.$dexDrawActive = false;
        }
        if (!this.$dexDrawSawSuper) handlePipeline();
      } else {
        handlePipeline();
      }
    }

    if (alpha < 1) canvas.context.globalAlpha = 1;
    canvas.restore();
  }

  outlineRadius() {
    return outlineRadius(this.background, this.vm || this.$vm);
  }

  drawElevation(canvas) {
    const elevation = Number(this.elevation) || 0;
    if (elevation <= 0) return;
    const width = this.getWidth();
    const height = this.getHeight();
    if (width <= 0 || height <= 0) return;
    const outline = this.computeOutline();
    if (!outline || outline.empty) return;
    if (outline.alpha <= 0) return;
    const ctx = canvas.context;
    const radius = outline.radius || 0;
    const spotBlur = Math.max(1, elevation * 1.5);
    const ambientBlur = Math.max(1, elevation * 0.5);
    const spotOffsetY = Math.max(0, elevation * 0.3);
    const pad = Math.ceil(spotBlur + spotOffsetY + 2);
    const surfaceWidth = width + pad * 2;
    const surfaceHeight = height + pad * 2;
    let offscreen = null;
    try {
      const Ctor = ctx.canvas?.constructor;
      if (typeof document !== 'undefined' && document.createElement) {
        const element = document.createElement('canvas');
        element.width = surfaceWidth;
        element.height = surfaceHeight;
        offscreen = element.getContext('2d');
      } else if (Ctor) {
        const element = new Ctor(surfaceWidth, surfaceHeight);
        offscreen = element.getContext('2d');
      }
    } catch (_) {
      offscreen = null;
    }
    const drawPass = (target, alpha, blur, offsetY) => {
      target.save();
      target.beginPath();
      roundedRectPath(target, pad + outline.left, pad + outline.top, outline.right - outline.left, outline.bottom - outline.top, radius);
      target.shadowColor = 'rgba(0,0,0,' + alpha + ')';
      target.shadowBlur = blur;
      target.shadowOffsetY = offsetY;
      target.fillStyle = '#000';
      target.fill();
      target.restore();
    };
    if (!offscreen) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      drawPass(ctx, 0.039, ambientBlur, 0);
      drawPass(ctx, 0.19, spotBlur, spotOffsetY);
      ctx.restore();
      return;
    }
    drawPass(offscreen, 0.039, ambientBlur, 0);
    drawPass(offscreen, 0.19, spotBlur, spotOffsetY);
    offscreen.save();
    offscreen.globalCompositeOperation = 'destination-out';
    offscreen.beginPath();
    roundedRectPath(offscreen, pad + outline.left, pad + outline.top, outline.right - outline.left, outline.bottom - outline.top, radius);
    offscreen.fillStyle = '#000';
    offscreen.fill();
    offscreen.restore();
    ctx.drawImage(offscreen.canvas, -pad, -pad);
  }

  computeOutline() {
    const vm = this.vm || this.$vm || null;
    const width = this.getWidth();
    const height = this.getHeight();
    if (this.outlineProvider && vm?.invoke) {
      try {
        const outlineObject = vm.allocateRawObject('Landroid/graphics/Outline;');
        const peer = vm.registry.getPeer(outlineObject, 'Landroid/graphics/Outline;');
        if (peer) {
          peer.alpha = 1;
          const viewObj = this.$javaObject || viewObjectForOutline(vm, this);
          vm.invoke(
            { classDesc: 'Landroid/view/ViewOutlineProvider;', name: 'getOutline', proto: { descriptor: '(Landroid/view/View;Landroid/graphics/Outline;)V', parameters: ['Landroid/view/View;', 'Landroid/graphics/Outline;'], returnType: 'V' } },
            this.outlineProvider,
            [viewObj, outlineObject],
            'virtual',
          );
          return { ...peer.outlineRect, radius: peer.outlineRadius || 0, alpha: peer.alpha, empty: peer.outlineEmpty === true };
        }
      } catch (_) {
        void _;
      }
    }
    const radius = this.outlineRadius();
    return {
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      radius,
      alpha: radius > 0 || this.background ? 1 : 0,
      empty: width <= 0 || height <= 0,
    };
  }

  canvasObject(canvas) {
    const vm = this.vm || this.$vm;
    if (!vm || !canvas) return canvas;
    if (canvas.$peer && canvas.$peer.canvas) return canvas;
    const object = vm.allocateRawObject('Landroid/graphics/Canvas;');
    object.$peer = { canvas };
    return object;
  }

  drawWithDex(canvas) {
    const vm = this.vm || this.$vm;
    const object = this.$javaObject;
    const descriptor = this.$descriptor;
    if (!vm || !object || !descriptor || typeof vm.findVirtual !== 'function') return false;
    if (this.$jsDrawHandled) return false;
    let drawRes = null;
    let dispatchRes = null;
    try {
      drawRes = vm.findVirtual(descriptor, 'onDraw', '(Landroid/graphics/Canvas;)V');
      dispatchRes = vm.findVirtual(descriptor, 'dispatchDraw', '(Landroid/graphics/Canvas;)V');
    } catch {
      return false;
    }
    const drawDex = drawRes && drawRes.kind === 'dex';
    const dispatchDex = dispatchRes && dispatchRes.kind === 'dex';
    if (!drawDex && !dispatchDex) return false;
    this.$jsDrawHandled = true;
    try {
      const canvasObj = this.canvasObject(canvas);
      if (drawDex) {
        vm.invoke(
          { classDesc: descriptor, name: 'onDraw', proto: drawRes.method.proto },
          object,
          [canvasObj],
          'virtual',
        );
      } else {
        this.onDraw(canvas);
      }
      if (dispatchDex) {
        vm.invoke(
          { classDesc: descriptor, name: 'dispatchDraw', proto: dispatchRes.method.proto },
          object,
          [canvasObj],
          'virtual',
        );
      } else {
        this.dispatchDraw(canvas);
      }
      return true;
    } catch (e) {
      return false;
    } finally {
      this.$jsDrawHandled = false;
    }
  }

  dispatchDraw(canvas) {
    const scrollX = this.scrollX | 0;
    const scrollY = this.scrollY | 0;
    if (scrollX || scrollY) {
      canvas.save();
      canvas.translate(-scrollX, -scrollY);
      for (const child of this.children) child.draw(canvas);
      canvas.restore();
      return;
    }
    for (const child of this.children) child.draw(canvas);
  }

  drawBackground(canvas) {
    const bg = this.background;
    if (!bg) return;
    const width = this.getWidth();
    const height = this.getHeight();
    if (width <= 0 || height <= 0) return;
    const options = this.drawableOptions({
      tint: this.backgroundTintList ?? this.backgroundTint ?? null,
    });
    const drew = drawDrawable(
      canvas.context,
      bg,
      { left: 0, top: 0, right: width, bottom: height },
      options,
    );
    if (drew) return;
    if (bg.type === 'bitmap' && bg.bitmap?.image) {
      canvas.context.save();
      canvas.context.drawImage(bg.bitmap.image, 0, 0, width, height);
      canvas.context.restore();
    }
  }

  drawForeground(canvas) {
    const fg = this.foreground;
    if (!fg) return;
    const width = this.getWidth();
    const height = this.getHeight();
    if (width <= 0 || height <= 0) return;
    const options = this.drawableOptions({
      tint: this.foregroundTintList ?? null,
    });
    drawDrawable(canvas.context, fg, { left: 0, top: 0, right: width, bottom: height }, options);
  }

  drawableOptions(extra = {}) {
    const vm = this.vm || this.$vm || null;
    const theme = vm?.themeAttributes || null;
    const highlight = theme && typeof theme.colorControlHighlight === 'number' ? theme.colorControlHighlight >>> 0 : null;
    return {
      vm,
      state: this.drawableStateMap(),
      stateSet: this.drawableState(),
      tint: null,
      rippleColor: highlight,
      onInvalidate: () => this.invalidate(),
      ...extra,
    };
  }

  getBackgroundPadding() {
    const vm = this.vm || this.$vm || null;
    const padding = drawablePadding(this.background, vm);
    if (!padding) return { left: 0, top: 0, right: 0, bottom: 0 };
    return padding;
  }

  compoundPadding() {
    const background = this.getBackgroundPadding();
    return {
      left: this.paddingLeft + (background.left || 0),
      top: this.paddingTop + (background.top || 0),
      right: this.paddingRight + (background.right || 0),
      bottom: this.paddingBottom + (background.bottom || 0),
    };
  }

  drawableStateMap() {
    return {
      enabled: this.enabled !== false,
      pressed: this.pressed === true,
      focused: this.focused === true || this.hasFocus === true,
      selected: this.selected === true,
      checked: this.checked === true || this.isChecked === true,
      activated: this.activated === true,
      hovered: this.hovered === true,
    };
  }

  drawableState() {
    const map = this.drawableStateMap();
    const set = [];
    for (const [name, id] of Object.entries(STATE)) {
      if (map[name]) set.push(id);
    }
    return set;
  }

  refreshDrawableState() {
    const vm = this.vm || this.$vm || null;
    const state = this.drawableState();
    const apply = (drawable) => {
      if (!drawable || typeof drawable !== 'object') return;
      const peer = drawable.$peer;
      if (peer && typeof peer === 'object') {
        peer.state = state;
      }
      if (!vm || typeof vm.findVirtual !== 'function') return;
      const descriptor = drawable.$dexClass?.descriptor || drawable.$runtimeClass?.descriptor || drawable.$nativeClass;
      if (!descriptor) return;
      try {
        const resolved = vm.findVirtual(descriptor, 'setState', '([I)Z');
        if (!resolved) return;
        const array = vm.newArray ? vm.newArray('I', state.length) : { $data: state.slice() };
        if (array && array.$data) {
          state.forEach((value, index) => { array.$data[index] = value | 0; });
        }
        vm.invoke(
          { classDesc: descriptor, name: 'setState', proto: resolved.method?.proto || { descriptor: '([I)Z', parameters: ['[I'], returnType: 'Z' } },
          drawable,
          [array],
          'virtual',
        );
      } catch {
        // 忽略无 setState 实现的 Drawable
      }
    };
    apply(this.background);
    apply(this.foreground);
    this.invalidate();
  }

  onDraw(canvas) {}

  invokeDexTouch(name, proto, motionEvent, guardKey) {
    const vm = this.vm || this.$vm;
    const object = this.$javaObject;
    const descriptor = this.$descriptor;
    if (!vm || !object || !descriptor || this[guardKey] || typeof vm.findVirtual !== 'function') {
      return undefined;
    }
    let resolved;
    try {
      resolved = vm.findVirtual(descriptor, name, proto);
    } catch {
      return undefined;
    }
    if (!resolved || resolved.kind !== 'dex') return undefined;
    this[guardKey] = true;
    try {
      const result = vm.invoke(
        { classDesc: descriptor, name, proto: resolved.method.proto },
        object,
        [motionEvent],
        'virtual',
      );
      return typeof result === 'number' ? result !== 0 : !!result;
    } catch {
      return undefined;
    } finally {
      this[guardKey] = false;
    }
  }

  dispatchTouchEvent(event) {
    if (this.visibility !== VISIBILITY.VISIBLE) return false;
    const vm = this.vm || this.$vm;
    const motionEvent = toMotionEventObject(vm, event);
    const hostEvent = toHostTouchEvent(event);
    const action = hostEvent.action;
    if (action === 'down') {
      this.$jsTouchIntercepted = false;
      const bgPeer = this.background?.$peer;
      if (bgPeer && typeof bgPeer.setHotspot === 'function') bgPeer.setHotspot(hostEvent.x, hostEvent.y);
      else if (bgPeer) {
        bgPeer.hotspotX = hostEvent.x;
        bgPeer.hotspotY = hostEvent.y;
      }
    }
    const dispatched = this.invokeDexTouch(
      'dispatchTouchEvent',
      '(Landroid/view/MotionEvent;)Z',
      motionEvent,
      '$jsDispatchTouchHandled',
    );
    if (dispatched !== undefined) return dispatched;
    if (!this.$jsTouchIntercepted) {
      const intercepted = this.invokeDexTouch(
        'onInterceptTouchEvent',
        '(Landroid/view/MotionEvent;)Z',
        motionEvent,
        '$jsInterceptTouchHandled',
      );
      if (intercepted === true) this.$jsTouchIntercepted = true;
    }
    if (this.$jsTouchIntercepted) {
      const interceptedHandled = this.onTouchEvent(motionEvent);
      if (action === 'down') {
        const hit = this.findTouchTarget(hostEvent.x, hostEvent.y);
        this.$interceptFallbackChild = null;
        this.$interceptFallbackOffset = null;
        this.$interceptFallbackStart = { x: hostEvent.x, y: hostEvent.y };
        let target = hit?.view || null;
        let lx = hit?.x ?? 0;
        let ly = hit?.y ?? 0;
        while (target && target !== this) {
          const handled = target.dispatchTouchEvent({ ...event, x: lx, y: ly, rawX: lx, rawY: ly });
          if (handled) {
            this.$interceptFallbackChild = target;
            this.$interceptFallbackOffset = { x: hostEvent.x - lx, y: hostEvent.y - ly };
            break;
          }
          lx += target.left + (target.translationX || 0);
          ly += target.top + (target.translationY || 0);
          target = target.parent;
        }
      } else if (this.$interceptFallbackChild) {
        const start = this.$interceptFallbackStart || { x: hostEvent.x, y: hostEvent.y };
        const moved = Math.hypot(hostEvent.x - start.x, hostEvent.y - start.y) > 20;
        const offset = this.$interceptFallbackOffset || { x: 0, y: 0 };
        if (moved) {
          this.$interceptFallbackChild.dispatchTouchEvent({ ...event, action: 'cancel', x: hostEvent.x - offset.x, y: hostEvent.y - offset.y, rawX: hostEvent.x - offset.x, rawY: hostEvent.y - offset.y });
          this.$interceptFallbackChild = null;
        } else {
          this.$interceptFallbackChild.dispatchTouchEvent({ ...event, x: hostEvent.x - offset.x, y: hostEvent.y - offset.y, rawX: hostEvent.x - offset.x, rawY: hostEvent.y - offset.y });
          if (action === 'up' || action === 'cancel') this.$interceptFallbackChild = null;
        }
      }
      if (interceptedHandled) {
        if (action === 'up' || action === 'cancel') this.$jsTouchIntercepted = false;
        return true;
      }
      if (action === 'up' || action === 'cancel') this.$jsTouchIntercepted = false;
    }
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];
      if (child.visibility === VISIBILITY.VISIBLE) {
        const cx = hostEvent.x + (this.scrollX | 0) - child.left - child.translationX;
        const cy = hostEvent.y + (this.scrollY | 0) - child.top - child.translationY;
        if (cx >= 0 && cy >= 0 && cx < child.getWidth() && cy < child.getHeight()) {
          if (child.dispatchTouchEvent({ ...hostEvent, x: cx, y: cy })) return true;
        }
      }
    }
    if (this.listeners.touch) {
      if (this.listeners.touch(this, motionEvent)) return true;
    }
    if (this.onTouchEvent(motionEvent)) return true;
    return false;
  }

  findTouchTarget(x, y) {
    for (let i = (this.children?.length || 0) - 1; i >= 0; i--) {
      const child = this.children[i];
      if (!child || child.visibility !== VISIBILITY.VISIBLE) continue;
      const left = child.left + (child.translationX || 0);
      const top = child.top + (child.translationY || 0);
      if (x >= left && x < left + child.getWidth() && y >= top && y < top + child.getHeight()) {
        const inner = child.findTouchTarget ? child.findTouchTarget(x - left, y - top) : null;
        return inner || { view: child, x: x - left, y: y - top };
      }
    }
    return null;
  }

  findTouchChild(x, y) {
    return this.findTouchTarget(x, y)?.view || null;
  }

  onTouchEvent(event) {
    if (!this.enabled) return false;
    const vm = this.vm || this.$vm;
    const motionEvent = toMotionEventObject(vm, event);
    const handled = this.invokeDexTouch(
      'onTouchEvent',
      '(Landroid/view/MotionEvent;)Z',
      motionEvent,
      '$jsOnTouchEventHandled',
    );
    if (handled !== undefined) return handled;
    const hostEvent = toHostTouchEvent(event);
    if (hostEvent.action === 'down') {
      this.pressed = true;
      this.invalidate();
      return this.clickable;
    }
    if (hostEvent.action === 'up') {
      if (this.pressed && this.clickable) {
        this.pressed = false;
        this.performClick();
        this.invalidate();
        return true;
      }
      this.pressed = false;
      this.invalidate();
    }
    return false;
  }

  getHitRect(out) {
    out.set(this.left, this.top, this.right, this.bottom);
    return out;
  }

  removeAllViews() {
    this.children = [];
  }

  toString() {
    return `${this.constructor.name}{${this.id.toString(16)}}`;
  }

  onAttachedToWindow() {}

  onDetachedFromWindow() {}

  isAttachedToWindow() {
    return !!this.parent;
  }

  getResources() {
    return this.context?.getResources ? this.context.getResources() : null;
  }

  getHandler() {
    return this.context?.getHandler ? this.context.getHandler() : null;
  }

  post(runnable) {
    const handler = this.getHandler();
    if (handler) return handler.post(runnable);
    queueMicrotask(() => callRunnable(runnable));
    return true;
  }

  postDelayed(runnable, delay) {
    const handler = this.getHandler();
    if (handler) return handler.postDelayed(runnable, delay);
    setTimeout(() => callRunnable(runnable), delay);
    return true;
  }

  removeCallbacks(runnable) {
    const handler = this.getHandler();
    if (handler) handler.removeCallbacks(runnable);
  }

  animate() {
    return new ViewPropertyAnimator(this);
  }

  bringToFront() {
    if (this.parent) {
      const siblings = this.parent.children;
      const index = siblings.indexOf(this);
      if (index >= 0) {
        siblings.splice(index, 1);
        siblings.push(this);
      }
    }
  }
}

function dispatchDexAttachedToWindow(view) {
  const object = view?.$javaObject;
  const vm = view?.$vm || object?.$vm;
  if (!object || !vm || view.$dexAttached || typeof vm.invokeByName !== 'function') return;
  view.$dexAttached = true;
  try {
    vm.invokeByName('onAttachedToWindow', '()V', object, [], 'virtual');
  } catch (error) {
    view.$dexAttached = false;
    vm.log?.('warn', 'view', `onAttachedToWindow 执行失败: ${error?.message || error}`);
  }
}

export class ViewGroup extends View {
  constructor(context = null) {
    super(context);
    this.clipChildren = true;
    this.clipToPadding = true;
    this.$zOrder = null;
  }

  addView(child, indexOrParams, params) {
    let index = this.children.length;
    if (typeof indexOrParams === 'number') index = indexOrParams;
    const layoutParams = params || (indexOrParams && typeof indexOrParams === 'object' ? indexOrParams : null);
    if (child.parent) child.parent.removeView(child);
    child.parent = this;
    if (layoutParams) child.layoutParams = layoutParams;
    if (!child.layoutParams && this.generateDefaultLayoutParams) {
      child.layoutParams = this.generateDefaultLayoutParams();
    }
    this.children.splice(index, 0, child);
    this.$zOrder = null;
    if (typeof child.onAttachedToWindow === 'function') child.onAttachedToWindow();
    dispatchDexAttachedToWindow(child);
    this.requestLayout();
    this.invalidate();
    return this;
  }

  removeView(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      this.$zOrder = null;
      child.parent = null;
      if (typeof child.onDetachedFromWindow === 'function') child.onDetachedFromWindow();
      this.requestLayout();
      this.invalidate();
    }
  }

  removeViewAt(index) {
    const child = this.children[index];
    if (child) this.removeView(child);
  }

  removeAllViews() {
    for (const child of this.children) {
      child.parent = null;
      child.onDetachedFromWindow();
    }
    this.children = [];
    this.requestLayout();
    this.invalidate();
  }

  getChildCount() {
    return this.children.length;
  }

  getChildAt(index) {
    return this.children[index] || null;
  }

  indexOfChild(child) {
    return this.children.indexOf(child);
  }

  setClipChildren(value) {
    this.clipChildren = !!value;
  }

  offsetChildrenTopAndBottom(offset) {
    const delta = offset | 0;
    for (const child of this.children || []) {
      child.top += delta;
      child.bottom += delta;
      if (typeof child.onOffsetChanged === 'function') child.onOffsetChanged(0, delta);
    }
  }

  offsetChildrenLeftAndRight(offset) {
    const delta = offset | 0;
    for (const child of this.children || []) {
      child.left += delta;
      child.right += delta;
    }
  }

  setClipToPadding(value) {
    this.clipToPadding = !!value;
  }

  onMeasure(widthSpec, heightSpec) {
    super.onMeasure(widthSpec, heightSpec);
  }

  measureChildren(widthSpec, heightSpec) {
    for (const child of this.children) {
      if (child.visibility === VISIBILITY.GONE) continue;
      const params = effectiveLayoutParams(child);
      const childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight, params.width);
      const childHeightSpec = getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom, params.height);
      child.measure(childWidthSpec, childHeightSpec);
    }
  }

  measureChildWithMargins(child, widthSpec, widthUsed, heightSpec, heightUsed) {
    if (!child || child.visibility === VISIBILITY.GONE) return;
    const params = effectiveLayoutParams(child);
    const ml = params.leftMargin || 0;
    const mr = params.rightMargin || 0;
    const mt = params.topMargin || 0;
    const mb = params.bottomMargin || 0;
    const widthPadding = this.paddingLeft + this.paddingRight + ml + mr;
    const heightPadding = this.paddingTop + this.paddingBottom + mt + mb;
    const childWidthSpec = getChildMeasureSpec(widthSpec, widthPadding, params.width);
    const childHeightSpec = getChildMeasureSpec(heightSpec, heightPadding, params.height);
    child.measure(childWidthSpec, childHeightSpec);
  }

  dispatchDraw(canvas) {
    const scrollX = this.scrollX | 0;
    const scrollY = this.scrollY | 0;
    const scrolled = !!(scrollX || scrollY);
    if (this.clipChildren) {
      canvas.save();
      const left = this.clipToPadding ? this.paddingLeft : 0;
      const top = this.clipToPadding ? this.paddingTop : 0;
      const right = this.clipToPadding ? this.getWidth() - this.paddingRight : this.getWidth();
      const bottom = this.clipToPadding ? this.getHeight() - this.paddingBottom : this.getHeight();
      canvas.clipRect(left, top, right, bottom);
    }
    if (scrolled) {
      canvas.save();
      canvas.translate(-scrollX, -scrollY);
    }
    let hasZ = false;
    for (const child of this.children) {
      if ((Number(child.z) || 0) !== 0 || (Number(child.elevation) || 0) !== 0) { hasZ = true; break; }
    }
    let order = this.children;
    if (hasZ) {
      if (!this.$zOrder || this.$zOrder.length !== this.children.length) {
        this.$zOrder = this.children
          .map((child, index) => ({ child, index }))
          .sort((a, b) => {
            const az = Number(a.child.z) || Number(a.child.elevation) || 0;
            const bz = Number(b.child.z) || Number(b.child.elevation) || 0;
            return az === bz ? a.index - b.index : az - bz;
          })
          .map((entry) => entry.child);
      }
      order = this.$zOrder;
    }
    for (const child of order) {
      if ((child.visibility | 0) === 8 || (child.visibility | 0) === 4) continue;
      child.draw(canvas);
    }
    if (scrolled) canvas.restore();
    if (this.clipChildren) canvas.restore();
  }
}

class ViewPropertyAnimator {
  constructor(view) {
    this.view = view;
    this.actions = [];
    this.durationValue = 300;
    this.delayValue = 0;
    this.props = {};
  }

  alpha(value) {
    this.props.alpha = value;
    return this;
  }

  translationX(value) {
    this.props.translationX = value;
    return this;
  }

  translationY(value) {
    this.props.translationY = value;
    return this;
  }

  scaleX(value) {
    this.props.scaleX = value;
    return this;
  }

  scaleY(value) {
    this.props.scaleY = value;
    return this;
  }

  setDuration(duration) {
    this.durationValue = duration;
    return this;
  }

  setStartDelay(delay) {
    this.delayValue = delay;
    return this;
  }

  withEndAction(action) {
    this.endAction = action;
    return this;
  }

  withStartAction(action) {
    this.startAction = action;
    return this;
  }

  setListener(listener) {
    this.listener = listener;
    return this;
  }

  cancel() {
    this.cancelled = true;
  }

  start() {
    const view = this.view;
    if (this.cancelled) return;
    if (this.startAction) this.startAction();
    const listeners = Array.isArray(this.listener) ? this.listener : (this.listener ? [this.listener] : []);
    for (const listener of listeners) {
      if (typeof listener?.onAnimationStart === 'function') listener.onAnimationStart();
    }
    const target = { ...this.props };
    for (const [key, value] of Object.entries(target)) {
      if (key === 'alpha') view.alpha = value;
      else if (key === 'translationX') view.translationX = value;
      else if (key === 'translationY') view.translationY = value;
    }
    view.invalidate();
    const finish = () => {
      if (this.endAction) this.endAction();
      for (const listener of listeners) {
        if (typeof listener?.onAnimationEnd === 'function') listener.onAnimationEnd();
        else if (typeof listener === 'function') listener();
      }
    };
    const duration = Number(this.durationValue) || 0;
    if (duration > 0) setTimeout(finish, duration);
    else finish();
  }
}

export function getDefaultSize(size, spec) {
  let result = size;
  const specMode = MeasureSpec.getMode(spec);
  const specSize = MeasureSpec.getSize(spec);
  switch (specMode) {
    case MeasureSpec.UNSPECIFIED:
      result = size;
      break;
    case MeasureSpec.AT_MOST:
    case MeasureSpec.EXACTLY:
      result = specSize;
      break;
  }
  return result;
}

export function resolveSize(size, spec) {
  const specMode = MeasureSpec.getMode(spec);
  const specSize = MeasureSpec.getSize(spec);
  switch (specMode) {
    case MeasureSpec.AT_MOST:
      return Math.min(size, specSize);
    case MeasureSpec.EXACTLY:
      return specSize;
    default:
      return size;
  }
}

export function getChildMeasureSpec(spec, padding, childDimension) {
  const specMode = MeasureSpec.getMode(spec);
  const specSize = MeasureSpec.getSize(spec);
  const size = Math.max(0, specSize - padding);
  let resultSize = 0;
  let resultMode = MeasureSpec.UNSPECIFIED;

  if (childDimension >= 0) {
    resultSize = childDimension;
    resultMode = MeasureSpec.EXACTLY;
  } else if (childDimension === -1) {
    switch (specMode) {
      case MeasureSpec.EXACTLY:
      case MeasureSpec.AT_MOST:
        resultSize = size;
        resultMode = specMode;
        break;
      case MeasureSpec.UNSPECIFIED:
        resultSize = 0;
        resultMode = MeasureSpec.UNSPECIFIED;
        break;
    }
  } else if (childDimension === -2) {
    switch (specMode) {
      case MeasureSpec.EXACTLY:
      case MeasureSpec.AT_MOST:
        resultSize = size;
        resultMode = MeasureSpec.AT_MOST;
        break;
      case MeasureSpec.UNSPECIFIED:
        resultSize = 0;
        resultMode = MeasureSpec.UNSPECIFIED;
        break;
    }
  }
  return MeasureSpec.makeMeasureSpec(resultSize, resultMode);
}

export function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(Number(r) || 0, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (!radius) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function colorToCss(color) {
  const value = color >>> 0;
  const a = ((value >>> 24) & 0xff) / 255;
  const r = (value >>> 16) & 0xff;
  const g = (value >>> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

function callRunnable(runnable) {
  if (typeof runnable === 'function') return runnable();
  if (runnable && typeof runnable.run === 'function') return runnable.run();
  if (runnable && runnable.$peer && typeof runnable.$peer.run === 'function') return runnable.$peer.run();
  return undefined;
}
