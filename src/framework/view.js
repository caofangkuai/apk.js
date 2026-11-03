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
    this.backgroundTint = color;
    this.invalidate();
    return this;
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
    this.enabled = !!enabled;
    this.invalidate();
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
    this.selected = !!selected;
    this.invalidate();
    return this;
  }

  isSelected() {
    return this.selected;
  }

  setActivated(activated) {
    this.activated = !!activated;
    this.invalidate();
    return this;
  }

  isActivated() {
    return this.activated;
  }

  setPressed(pressed) {
    this.pressed = !!pressed;
    this.invalidate();
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

  offsetLeftAndRight(offset) {
    this.left += offset;
    this.right += offset;
    this.invalidate();
  }

  offsetTopAndBottom(offset) {
    this.top += offset;
    this.bottom += offset;
    this.invalidate();
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
    if (globalThis.__DBG_FVID) {
      const ids=[]; const walk=(v)=>{ if(v.id!==undefined&&v.id!==null) ids.push((v.id>>>0).toString(16)+':'+(v.$descriptor||v.constructor?.name)); for(const c of v.children||[]) walk(c); };
      walk(this);
      console.error('FVID req=0x'+(id>>>0).toString(16)+' root='+(this.$descriptor||this.constructor?.name)+' ids='+ids.slice(0,20).join(','));
    }
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findViewById(id);
      if (found) return found;
    }
    return null;
  }

  measure(widthSpec, heightSpec) {
    if (globalThis.__RVT && /\/RecyclerView;$/.test(this.$descriptor || '')) { try { console.error('RVT enter depth=' + measureDepth + ' h=' + ((heightSpec>>>30)&3) + ':' + (heightSpec&0x3fffffff) + ' meash=' + this.measuredHeight + ' kids=' + this.children.length); } catch {} }
    measureDepth++;
    try {
      if (this.measureWithDex(widthSpec, heightSpec)) { if (globalThis.__RVT && /\/RecyclerView;$/.test(this.$descriptor || '')) console.error('RVT dex-ok meash=' + this.measuredHeight + ' kids=' + this.children.length); return; }
      this.onMeasure(widthSpec, heightSpec);
      if (globalThis.__RVT && /\/RecyclerView;$/.test(this.$descriptor || '')) console.error('RVT host-fallback meash=' + this.measuredHeight + ' kids=' + this.children.length);
    } finally {
      measureDepth--;
    }
  }

  measureWithDex(widthSpec, heightSpec) {
    const vm = this.vm || this.$vm;
    const object = this.$javaObject;
    const descriptor = this.$descriptor;
    if (globalThis.__RVL && /\/RecyclerView;$/.test(descriptor || '')) { console.error('RVL top=' + this.top + ' scrollY=' + this.scrollY + ' kids=' + this.children.length + ' ' + this.children.map(c=>c.top).join(',')); }
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
    if (globalThis.__MS4 && /recyclerview/.test(descriptor)) {
      const sm=(x)=>['U','E','A'][(x>>>30)&3]+':'+(x&0x3fffffff);
      console.error('MSPEC ' + descriptor + ' w=' + sm(widthSpec) + ' h=' + sm(heightSpec) + ' lpH=' + (this.layoutParams&&this.layoutParams.height));
    }
    this.$jsMeasureHandled = true;
    if (globalThis.__DBG_MS && /tabs\/TabLayout/.test(descriptor)) { const sm=(x)=>[(x>>>30)&3,(x&0x3fffffff)]; console.error('TL_DEX_MEASURE kind=' + resolved.kind + ' h=' + JSON.stringify(sm(heightSpec))); }
    try {
      vm.invoke(
        { classDesc: descriptor, name: 'onMeasure', proto: ref.proto },
        object,
        [widthSpec, heightSpec],
        'virtual'
      );
      if (globalThis.__DBG_RV && /\/RecyclerView;$/.test(descriptor)) console.error('RVFB meash=' + this.measuredHeight + ' kids=' + this.children.length);
      if (/\/RecyclerView;$/.test(descriptor) && this.measuredHeight === 0 && this.children.length > 0) {
        let maxBottom = 0;
        for (const child of this.children) {
          if (child.visibility === 8) continue;
          maxBottom = Math.max(maxBottom, child.bottom || 0, (child.top || 0) + (child.getMeasuredHeight ? child.getMeasuredHeight() : (child.measuredHeight || 0)));
        }
        if (maxBottom > 0) {
          const hMode = (heightSpec >>> 30) & 3;
          let h = maxBottom + this.paddingTop + this.paddingBottom;
          if (hMode === 2) h = Math.min(h, heightSpec & 0x3fffffff);
          this.setMeasuredDimension(this.measuredWidth || MeasureSpec.getSize(widthSpec), h);
          if (globalThis.__DBG_RV) console.error('RVFB set h=' + h + ' maxBottom=' + maxBottom);
        }
      }
      if (/com\.google\.android\.material\.tabs\.TabLayout;$/.test(descriptor) && (this.measuredHeight === 0 || this.measuredWidth === 0)) {
        const wMode = (widthSpec >>> 30) & 3;
        const hMode = (heightSpec >>> 30) & 3;
        const defW = MeasureSpec.getSize(widthSpec) || 360;
        const density = this.$density || this.resources?.getDisplayMetrics?.()?.density || 1;
        const defH = Math.round(48 * density);
        const childrenH = (() => {
          let m = 0;
          const content = this.children[0];
          if (content) for (const tab of content.children || []) m = Math.max(m, (tab.getMeasuredHeight ? tab.getMeasuredHeight() : tab.measuredHeight) || 0);
          return m;
        })();
        const h = childrenH > 0 ? Math.max(childrenH + Math.round(16 * density), defH) : defH;
        this.setMeasuredDimension(
          wMode === 2 ? (widthSpec & 0x3fffffff) : Math.min(defW, widthSpec & 0x3fffffff),
          hMode === 2 ? (heightSpec & 0x3fffffff) : h
        );
      }
      if (/androidx\/appcompat\/widget\/Toolbar;/.test(descriptor) && this.measuredHeight === 0) {
        const lpHeight = this.layoutParams?.height;
        const fallback = lpHeight > 0 ? lpHeight : (this.getMinimumHeight?.() || 0);
        if (fallback > 0) {
          this.setMeasuredDimension(this.measuredWidth || MeasureSpec.getSize(widthSpec), fallback);
        }
      }
      return true;
    } catch (e) {
      if (/RecyclerView;$/.test(descriptor)) console.error('RVMEASURE_ERR ' + String(e && (e.stack || e.message || e)).split('\n').slice(0,10).join('\n   '));
      if (/TabLayout;$/.test(descriptor)) console.error('TLMEASURE_ERR ' + String(e && (e.stack || e.message || e)).split('\n').slice(0,6).join(' | '));
      if (globalThis.__DBG_ARG) console.error('MEASURE_ERR', descriptor, String(e.message).slice(0,80));
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
    if (globalThis.__DBG_ARG && /ContentFrameLayout|FitWindows|CoordinatorLayout/.test(this.$descriptor||'')) console.error('SMD', this.$descriptor, 'w=' + width, 'h=' + height);
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
    if (globalThis.__DBG_MS && /tabs\/TabLayout/.test(descriptor)) { const sm=(x)=>[(x>>>30)&3,(x&0x3fffffff)]; console.error('TL_MEASURE spec=' + JSON.stringify(sm(heightSpec)) + ' wspec=' + JSON.stringify(sm(widthSpec))); }
    try {
      for (const child of this.children) child.$relayoutBase = { left: child.left, top: child.top };
      vm.invoke(
        { classDesc: descriptor, name: 'onLayout', proto: ref.proto },
        object,
        [changed ? 1 : 0, left, top, right, bottom],
        'virtual'
      );
      if (left !== 0 || top !== 0) {
        const prev = this.$dexAbsOffset || { dx: 0, dy: 0 };
        this.$dexAbsOffset = { dx: left, dy: top };
        let alreadyAbsolute = false;
        for (const child of this.children) {
          if (Math.abs(child.top - top) <= 1 && Math.abs(child.left - left) <= 1) {
            alreadyAbsolute = true;
            break;
          }
        }
        const dx = alreadyAbsolute ? 0 : left - prev.dx;
        const dy = alreadyAbsolute ? 0 : top - prev.dy;
        if (dx !== 0 || dy !== 0) {
          const shiftTree = (node, sx, sy) => {
            node.left += sx;
            node.right += sx;
            node.top += sy;
            node.bottom += sy;
            for (const g of node.children || []) shiftTree(g, sx, sy);
          };
          for (const child of this.children) shiftTree(child, dx, dy);
        }
      }
      for (const child of this.children) delete child.$relayoutBase;
      return true;
    } catch (e) {
      if (globalThis.__DBG_ARG) console.error('LAYOUT_ERR', descriptor, String(e.message).slice(0,100));
      return false;
    } finally {
      this.$jsLayoutHandled = false;
    }
  }

  onLayout(changed, left, top, right, bottom) {}

  draw(canvas) {
    if (this.visibility !== VISIBILITY.VISIBLE) return;
    const parent = this.parent;
    const offsetX = this.left - (parent ? parent.left : 0);
    const offsetY = this.top - (parent ? parent.top : 0);
    canvas.save();
    canvas.translate(offsetX + this.translationX, offsetY + this.translationY);
    const alpha = this.alpha;
    if (alpha < 1) canvas.context.globalAlpha = alpha;
    this.drawBackground(canvas);
    if (!this.drawWithDex(canvas)) {
      this.onDraw(canvas);
      this.dispatchDraw(canvas);
    }
    if (alpha < 1) canvas.context.globalAlpha = 1;
    canvas.restore();
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
    for (const child of this.children) child.draw(canvas);
  }

  drawBackground(canvas) {
    const bg = this.background;
    if (!bg) return;
    if (bg.type === 'color') {
      const color = this.backgroundTint !== null ? this.backgroundTint : bg.color;
      canvas.context.save();
      canvas.context.fillStyle = colorToCss(color);
      canvas.context.fillRect(0, 0, this.getWidth(), this.getHeight());
      canvas.context.restore();
      return;
    }
    if (bg.type === 'shape') {
      drawShapeBackground(canvas, bg, this);
      return;
    }
    if (bg.type === 'xml') {
      const root = bg.xml;
      const inner = unwrapXmlDrawable(root);
      if (inner && inner.name === 'shape') {
        drawShapeBackground(canvas, { type: 'shape', xml: inner }, this);
      } else if (inner && inner.name === 'vector') {
        if (typeof canvas.drawVector === 'function') canvas.drawVector(inner, 0, 0, this.getWidth(), this.getHeight());
      }
      return;
    }
    if (bg.type === 'bitmap' && bg.bitmap?.image) {
      canvas.context.save();
      canvas.context.drawImage(bg.bitmap.image, 0, 0, this.getWidth(), this.getHeight());
      canvas.context.restore();
      return;
    }
    const peerDrawable = bg.$peer || (bg.$object ? bg.$object.$peer : null) || getDrawablePeer(this, bg);
    if (peerDrawable) {
      const content = peerDrawable.content;
      if (content) {
        const contentPeer = content.$peer || (content.$object ? content.$object.$peer : null) || getDrawablePeer(this, content);
        if (contentPeer && (contentPeer.color !== undefined || contentPeer.cornerRadii || contentPeer.cornerRadius)) {
          drawPeerDrawable(canvas, contentPeer, this);
          return;
        }
      }
      if (peerDrawable.color !== undefined || peerDrawable.cornerRadii || peerDrawable.cornerRadius) {
        drawPeerDrawable(canvas, peerDrawable, this);
      }
    }
  }

  onDraw(canvas) {}

  dispatchTouchEvent(event) {
    if (this.visibility !== VISIBILITY.VISIBLE) return false;
    if (this.listeners.touch) {
      if (this.listeners.touch(this, event)) return true;
    }
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];
      if (child.visibility === VISIBILITY.VISIBLE) {
        const cx = event.x - child.left - child.translationX;
        const cy = event.y - child.top - child.translationY;
        if (cx >= 0 && cy >= 0 && cx < child.getWidth() && cy < child.getHeight()) {
          if (child.dispatchTouchEvent(event)) return true;
        }
      }
    }
    if (this.onTouchEvent(event)) return true;
    return false;
  }

  onTouchEvent(event) {
    if (!this.enabled) return false;
    if (event.action === 'down') {
      this.pressed = true;
      this.invalidate();
      return this.clickable;
    }
    if (event.action === 'up') {
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

export class ViewGroup extends View {
  constructor(context = null) {
    super(context);
    this.clipChildren = true;
    this.clipToPadding = true;
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
    if (typeof child.onAttachedToWindow === 'function') child.onAttachedToWindow();
    this.requestLayout();
    this.invalidate();
    return this;
  }

  removeView(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
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

  setClipToPadding(value) {
    this.clipToPadding = !!value;
  }

  onMeasure(widthSpec, heightSpec) {
    super.onMeasure(widthSpec, heightSpec);
  }

  measureChildren(widthSpec, heightSpec) {
    for (const child of this.children) {
      if (child.visibility === VISIBILITY.GONE) continue;
      const params = child.layoutParams || { width: -2, height: -2 };
      const childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight, params.width);
      const childHeightSpec = getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom, params.height);
      child.measure(childWidthSpec, childHeightSpec);
    }
  }

  measureChildWithMargins(child, widthSpec, widthUsed, heightSpec, heightUsed) {
    if (!child || child.visibility === VISIBILITY.GONE) return;
    const params = child.layoutParams || { width: -2, height: -2 };
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
    if (this.clipChildren) {
      canvas.save();
      canvas.clipRect(0, 0, this.getWidth(), this.getHeight());
    }
    for (const child of this.children) child.draw(canvas);
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
    const target = { ...this.props };
    for (const [key, value] of Object.entries(target)) {
      if (key === 'alpha') view.alpha = value;
      else if (key === 'translationX') view.translationX = value;
      else if (key === 'translationY') view.translationY = value;
    }
    view.invalidate();
    const finish = () => {
      if (this.endAction) this.endAction();
      const listeners = Array.isArray(this.listener) ? this.listener : (this.listener ? [this.listener] : []);
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

export function colorToCss(color) {
  const value = color >>> 0;
  const a = ((value >>> 24) & 0xff) / 255;
  const r = (value >>> 16) & 0xff;
  const g = (value >>> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

function getDrawablePeer(view, value) {
  if (!value || typeof value !== 'object') return null;
  const vm = view?.vm || view?.$vm || null;
  if (!vm || !vm.registry?.getPeer) return null;
  try {
    const peer = vm.registry.getPeer(value);
    return peer && typeof peer === 'object' ? peer : null;
  } catch (_error) {
    return null;
  }
}

function unwrapXmlDrawable(node) {
  let current = node;
  const wrappers = new Set(['ripple', 'selector', 'inset', 'layer-list', 'animated-selector', 'animated-vector']);
  let guard = 0;
  while (current && wrappers.has(current.name) && guard++ < 8) {
    const children = (current.children || []).filter((c) => c.type === 'element');
    const inner = children.find((c) => c.name === 'item');
    const next = inner || children[0];
    if (!next) return current;
    const nested = (next.children || []).filter((c) => c.type === 'element');
    current = (nested.find((c) => c.name === 'shape' || c.name === 'vector') || next);
    if (wrappers.has(current.name)) continue;
    break;
  }
  return current;
}

function drawPeerDrawable(canvas, peer, view) {
  const ctx = canvas.context;
  const width = view.getWidth();
  const height = view.getHeight();
  const color = typeof peer.color === 'number' ? peer.color : 0;
  const alpha = color >>> 24;
  if (alpha === 0 && peer.color === 0 && !peer.cornerRadii && !peer.cornerRadius) return;
  ctx.save();
  ctx.fillStyle = colorToCss(color);
  const radii = peer.cornerRadii;
  const radius = peer.cornerRadius || (radii && radii.length ? Math.max(...radii) : 0);
  if (radius > 0) {
    roundedRect(ctx, 0, 0, width, height, radius);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, width, height);
  }
  const strokeWidth = peer.strokeWidth || 0;
  if (strokeWidth > 0) {
    ctx.strokeStyle = colorToCss(peer.strokeColor || 0xff000000);
    ctx.lineWidth = strokeWidth;
    if (radius > 0) {
      roundedRect(ctx, strokeWidth / 2, strokeWidth / 2, width - strokeWidth, height - strokeWidth, radius);
      ctx.stroke();
    } else {
      ctx.strokeRect(strokeWidth / 2, strokeWidth / 2, width - strokeWidth, height - strokeWidth);
    }
  }
  ctx.restore();
}

function resolveReferenceValue(vm, value, depth = 0) {
  if (value === null || value === undefined || depth > 8) return value;
  if (typeof value !== 'object' || value.reference === undefined) return value;
  const resources = vm?.resources;
  const id = value.reference >>> 0;
  if (resources) {
    let resolved;
    try {
      resolved = resources.resolve(id);
    } catch (_error) {
      resolved = null;
    }
    if (resolved !== null && resolved !== undefined) {
      if (typeof resolved === 'object' && resolved.reference !== undefined) {
        return resolveReferenceValue(vm, resolved, depth + 1);
      }
      return resolved;
    }
    const key = resources.table?.getEntry?.(id)?.key;
    const theme = vm?.themeAttributes;
    if (key && theme && Object.prototype.hasOwnProperty.call(theme, key)) {
      return theme[key];
    }
  }
  return value;
}

function resolveShapeColor(view, value) {
  const vm = view?.vm || view?.$vm || null;
  const resolved = resolveReferenceValue(vm, value);
  if (resolved && typeof resolved === 'object') {
    if (resolved.reference !== undefined) return resolved.reference >>> 0;
    if (resolved.color !== undefined) return resolved.color >>> 0;
  }
  return parseShapeColor(resolved);
}

function resolveShapeDimension(view, value) {
  const vm = view?.vm || view?.$vm || null;
  const resolved = resolveReferenceValue(vm, value);
  if (resolved && typeof resolved === 'object') {
    if (resolved.dimension) {
      const density = vm?.resources?.displayMetrics?.density || vm?.displayMetrics?.density || 1;
      const unit = resolved.dimension.unit;
      const magnitude = resolved.dimension.value;
      if (unit === 'dp' || unit === 'dip' || unit === 'sp') return magnitude * density;
      if (unit === 'pt') return magnitude * density * 1.333;
      if (unit === 'in') return magnitude * density * 160;
      if (unit === 'mm') return magnitude * density * 160 / 25.4;
      return magnitude;
    }
    if (resolved.reference !== undefined) return resolved.reference;
  }
  if (typeof resolved === 'string' && /dp|dip|sp|pt|px/.test(resolved)) {
    const density = vm?.resources?.displayMetrics?.density || 1;
    const match = /^(-?\d+(?:\.\d+)?)(dp|dip|sp|pt|px)$/.exec(resolved);
    if (match) return match[2] === 'px' ? parseFloat(match[1]) : parseFloat(match[1]) * density;
  }
  return parseDimensionAttr(resolved);
}

function drawShapeBackground(canvas, bg, view) {
  const shape = bg.xml;
  const ctx = canvas.context;
  const width = view.getWidth();
  const height = view.getHeight();
  ctx.save();
  const solid = shape.children.find((c) => c.type === 'element' && c.name === 'solid');
  const corners = shape.children.find((c) => c.type === 'element' && c.name === 'corners');
  const stroke = shape.children.find((c) => c.type === 'element' && c.name === 'stroke');
  const color = solid ? resolveShapeColor(view, getShapeAttribute(solid, 'color')) : 0;
  const radius = corners ? resolveShapeDimension(view, getShapeAttribute(corners, 'radius')) : 0;
  ctx.fillStyle = colorToCss(color);
  if (radius > 0) {
    roundedRect(ctx, 0, 0, width, height, radius);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, width, height);
  }
  if (stroke) {
    const strokeColor = resolveShapeColor(view, getShapeAttribute(stroke, 'color'));
    const strokeWidth = resolveShapeDimension(view, getShapeAttribute(stroke, 'width')) || 1;
    ctx.strokeStyle = colorToCss(strokeColor);
    ctx.lineWidth = strokeWidth;
    if (radius > 0) {
      roundedRect(ctx, strokeWidth / 2, strokeWidth / 2, width - strokeWidth, height - strokeWidth, radius);
      ctx.stroke();
    } else {
      ctx.strokeRect(strokeWidth / 2, strokeWidth / 2, width - strokeWidth, height - strokeWidth);
    }
  }
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function getShapeAttribute(node, name) {
  if (!node) return null;
  if (typeof node.getAttribute === 'function') {
    const direct = node.getAttribute(`android:${name}`) ?? node.getAttribute(name);
    if (direct !== undefined && direct !== null) return direct;
  }
  const attrs = node.attrs || [];
  for (const attr of attrs) {
    const attrName = attr.name || '';
    if (attrName === name || attrName === `android:${name}` || attrName.endsWith(`:${name}`)) {
      return attr.value ?? attr.data ?? null;
    }
  }
  return null;
}

function parseShapeColor(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'object' && value.reference !== undefined) return value.reference >>> 0;
  const text = String(value);
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 6) return (0xff000000 | parseInt(hex, 16)) >>> 0;
    if (hex.length === 8) return parseInt(hex, 16) >>> 0;
    if (hex.length === 3) {
      const [r, g, b] = hex.split('').map((c) => parseInt(c + c, 16));
      return (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
    }
  }
  return 0;
}

function parseDimensionAttr(value) {
  if (!value) return 0;
  if (typeof value === 'object' && value.dimension) return value.dimension.value;
  const match = /^(-?\d+(?:\.\d+)?)(dp|sp|px)?$/.exec(String(value));
  return match ? parseFloat(match[1]) : 0;
}

function callRunnable(runnable) {
  if (typeof runnable === 'function') return runnable();
  if (runnable && typeof runnable.run === 'function') return runnable.run();
  if (runnable && runnable.$peer && typeof runnable.$peer.run === 'function') return runnable.$peer.run();
  return undefined;
}
