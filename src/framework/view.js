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

  setTag(tag) {
    this.tag = tag;
    return this;
  }

  getTag() {
    return this.tag;
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
        removeOnGlobalLayoutListener: () => undefined,
        addOnPreDrawListener: () => undefined,
        removeOnPreDrawListener: () => undefined,
        isAlive: () => true,
        dispatchOnGlobalLayout: () => undefined,
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
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findViewById(id);
      if (found) return found;
    }
    return null;
  }

  measure(widthSpec, heightSpec) {
    this.onMeasure(widthSpec, heightSpec);
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
    this.measuredWidth = width;
    this.measuredHeight = height;
    this.measuredWidthState = width;
    this.measuredHeightState = height;
  }

  layout(left, top, right, bottom) {
    const changed = this.left !== left || this.top !== top || this.right !== right || this.bottom !== bottom;
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    this.onLayout(changed, left, top, right, bottom);
  }

  onLayout(changed, left, top, right, bottom) {}

  draw(canvas) {
    if (this.visibility !== VISIBILITY.VISIBLE) return;
    canvas.save();
    canvas.translate(this.left + this.translationX, this.top + this.translationY);
    const alpha = this.alpha;
    if (alpha < 1) canvas.context.globalAlpha = alpha;
    this.drawBackground(canvas);
    this.onDraw(canvas);
    this.dispatchDraw(canvas);
    if (alpha < 1) canvas.context.globalAlpha = 1;
    canvas.restore();
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
    if (bg.type === 'bitmap' && bg.bitmap?.image) {
      canvas.context.save();
      canvas.context.drawImage(bg.bitmap.image, 0, 0, this.getWidth(), this.getHeight());
      canvas.context.restore();
    }
  }

  onDraw(canvas) {}

  dispatchTouchEvent(event) {
    if (this.visibility !== VISIBILITY.VISIBLE) return false;
    if (this.listeners.touch) {
      if (this.listeners.touch(this, event)) return true;
    }
    if (this.onTouchEvent(event)) return true;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];
      if (child.visibility === VISIBILITY.VISIBLE) {
        const x = event.x - child.left - child.translationX;
        const y = event.y - child.top - child.translationY;
        if (x >= 0 && y >= 0 && x < child.getWidth() && y < child.getHeight()) {
          const childEvent = { ...event, x, y };
          if (child.dispatchTouchEvent(childEvent)) return true;
        }
      }
    }
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
    child.onAttachedToWindow();
    this.requestLayout();
    this.invalidate();
    return this;
  }

  removeView(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parent = null;
      child.onDetachedFromWindow();
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

  start() {
    const view = this.view;
    const target = { ...this.props };
    for (const [key, value] of Object.entries(target)) {
      if (key === 'alpha') view.alpha = value;
      else if (key === 'translationX') view.translationX = value;
      else if (key === 'translationY') view.translationY = value;
    }
    view.invalidate();
    if (this.endAction) setTimeout(() => this.endAction(), this.durationValue);
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

function drawShapeBackground(canvas, bg, view) {
  const shape = bg.xml;
  const ctx = canvas.context;
  const width = view.getWidth();
  const height = view.getHeight();
  ctx.save();
  const solid = shape.children.find((c) => c.type === 'element' && c.name === 'solid');
  const corners = shape.children.find((c) => c.type === 'element' && c.name === 'corners');
  const stroke = shape.children.find((c) => c.type === 'element' && c.name === 'stroke');
  const color = solid ? parseShapeColor(getShapeAttribute(solid,'color')) : 0;
  const radius = corners ? parseDimensionAttr(getShapeAttribute(corners,'radius')) : 0;
  ctx.fillStyle = colorToCss(color);
  if (radius > 0) {
    roundedRect(ctx, 0, 0, width, height, radius);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, width, height);
  }
  if (stroke) {
    const strokeColor = parseShapeColor(getShapeAttribute(stroke,'color'));
    const strokeWidth = parseDimensionAttr(getShapeAttribute(stroke,'width')) || 1;
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
  if (!value) return 0;
  if (typeof value === 'object' && value.reference !== undefined) return value.reference;
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
