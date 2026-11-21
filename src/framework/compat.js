import { floatBitsToNumber } from '../runtime/values.js';
import { Bitmap } from './graphics.js';

/**
 * 公共 API 兼容层：对照 android.jar 补齐宿主类缺失的方法。
 *
 * 只补充 `registry.js` 里没有的签名，已实现的方法不会被覆盖。
 * 这里的方法要么有真实语义（转发到宿主对象），要么返回 AOSP 的合法默认值，
 * 避免调用方拿到 undefined 后继续做 null 检查失败。
 */


function readIntArray(value) {
  if (!value) return [];
  if (value.$data) return value.$data;
  return Array.isArray(value) ? value : [];
}

/** CharSequence / String / char[] 统一成 JS 字符串（null 视为空串）。 */
function textOf(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value.$string === 'string') return value.$string;
  if (value.$peer && typeof value.$peer.text === 'string') return value.$peer.text;
  if (Array.isArray(value.$data)) return value.$data.map((code) => String.fromCharCode(code & 0xffff)).join('');
  if (Array.isArray(value.$peer?.parts)) return value.$peer.parts.join('');
  return String(value);
}



function viewOf(self) {
  return self?.view ?? null;
}

function walkViews(view, visit) {
  if (!view) return null;
  const found = visit(view);
  if (found) return found;
  for (const child of view.children || []) {
    const nested = walkViews(child, visit);
    if (nested) return nested;
  }
  return view.child ? walkViews(view.child, visit) : null;
}

function bitmapPeer(bitmap) {
  if (!bitmap) return null;
  return bitmap.$peer || bitmap.bitmap || bitmap;
}

const VIEW_METHODS = {
  'getVerticalFadingEdgeLength()I': (self) => viewOf(self)?.getVerticalFadingEdgeLength?.() ?? 0,
  'getHorizontalFadingEdgeLength()I': (self) => viewOf(self)?.getHorizontalFadingEdgeLength?.() ?? 0,
  'getVerticalScrollbarWidth()I': (self) => viewOf(self)?.getVerticalScrollbarWidth?.() ?? 0,
  'getHorizontalScrollbarHeight()I': (self) => viewOf(self)?.getHorizontalScrollbarHeight?.() ?? 0,
  'getVerticalScrollbarPosition()I': (self) => viewOf(self)?.getVerticalScrollbarPosition?.() ?? 0,
  'setVerticalScrollbarPosition(I)V': (self, [position]) => viewOf(self)?.setVerticalScrollbarPosition?.(position | 0),
  'setVerticalScrollBarEnabled(Z)V': (self, [enabled]) => viewOf(self)?.setVerticalScrollBarEnabled?.(!!enabled),
  'isVerticalScrollBarEnabled()Z': (self) => viewOf(self)?.isVerticalScrollBarEnabled?.() ?? true,
  'setHorizontalScrollBarEnabled(Z)V': (self, [enabled]) => viewOf(self)?.setHorizontalScrollBarEnabled?.(!!enabled),
  'isHorizontalScrollBarEnabled()Z': (self) => viewOf(self)?.isHorizontalScrollBarEnabled?.() ?? true,
  'setScrollBarStyle(I)V': (self, [style]) => viewOf(self)?.setScrollBarStyle?.(style | 0),
  'getScrollBarStyle()I': (self) => viewOf(self)?.getScrollBarStyle?.() ?? 0,
  'setScrollBarSize(I)V': (self, [size]) => viewOf(self)?.setScrollBarSize?.(size | 0),
  'getScrollBarSize()I': (self) => viewOf(self)?.getScrollBarSize?.() ?? 0,
  'setScrollbarFadingEnabled(Z)V': (self, [enabled]) => viewOf(self)?.setScrollbarFadingEnabled?.(!!enabled),
  'isScrollbarFadingEnabled()Z': (self) => viewOf(self)?.isScrollbarFadingEnabled?.() ?? true,
  'setScrollBarFadeDuration(I)V': (self, [duration]) => viewOf(self)?.setScrollBarFadeDuration?.(duration | 0),
  'getScrollBarFadeDuration()I': (self) => viewOf(self)?.getScrollBarFadeDuration?.() ?? 250,
  'setScrollBarDefaultDelayBeforeFade(I)V': (self, [delay]) => viewOf(self)?.setScrollBarDefaultDelayBeforeFade?.(delay | 0),
  'getScrollBarDefaultDelayBeforeFade()I': (self) => viewOf(self)?.getScrollBarDefaultDelayBeforeFade?.() ?? 300,
  'awakenScrollBars()Z': (self) => viewOf(self)?.awakenScrollBars?.() ?? true,
  'awakenScrollBars(I)Z': (self, [delay]) => viewOf(self)?.awakenScrollBars?.(delay | 0) ?? true,
  'awakenScrollBars(IZ)Z': (self, [delay]) => viewOf(self)?.awakenScrollBars?.(delay | 0) ?? true,
  'computeVerticalScrollRange()I': (self) => viewOf(self)?.computeVerticalScrollRange?.() ?? viewOf(self)?.height ?? 0,
  'computeVerticalScrollOffset()I': (self) => viewOf(self)?.computeVerticalScrollOffset?.() ?? 0,
  'computeVerticalScrollExtent()I': (self) => viewOf(self)?.computeVerticalScrollExtent?.() ?? viewOf(self)?.height ?? 0,
  'computeHorizontalScrollRange()I': (self) => viewOf(self)?.computeHorizontalScrollRange?.() ?? viewOf(self)?.width ?? 0,
  'computeHorizontalScrollOffset()I': (self) => viewOf(self)?.computeHorizontalScrollOffset?.() ?? 0,
  'computeHorizontalScrollExtent()I': (self) => viewOf(self)?.computeHorizontalScrollExtent?.() ?? viewOf(self)?.width ?? 0,
  'getScrollIndicators()I': () => 0,
  'setScrollIndicators(I)V': () => {},
  'setScrollIndicators(II)V': () => {},
  'setOnScrollChangeListener(Landroid/view/View$OnScrollChangeListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) view.onScrollChangeListener = listener;
  },
  'setOnContextClickListener(Landroid/view/View$OnContextClickListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) view.onContextClickListener = listener;
  },
  'setOnCreateContextMenuListener(Landroid/view/View$OnCreateContextMenuListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) view.onCreateContextMenuListener = listener;
  },
  'setOnGenericMotionListener(Landroid/view/View$OnGenericMotionListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) view.onGenericMotionListener = listener;
  },
  'setOnDragListener(Landroid/view/View$OnDragListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) view.onDragListener = listener;
  },
  'callOnClick()Z': (self) => viewOf(self)?.performClick?.() ?? false,
  'performLongClick()Z': (self) => viewOf(self)?.performLongClick?.() ?? false,
  'performLongClick(FF)Z': (self) => viewOf(self)?.performLongClick?.() ?? false,
  'performContextClick()Z': () => false,
  'performContextClick(FF)Z': () => false,
  'showContextMenu()Z': () => false,
  'showContextMenu(FF)Z': () => false,
  'startActionMode(Landroid/view/ActionMode$Callback;)Landroid/view/ActionMode;': () => null,
  'requestRectangleOnScreen(Landroid/graphics/Rect;)Z': () => false,
  'requestRectangleOnScreen(Landroid/graphics/Rect;Z)Z': () => false,
  'getOnFocusChangeListener()Landroid/view/View$OnFocusChangeListener;': (self) => viewOf(self)?.onFocusChangeListener ?? null,
  'setOnFocusChangeListener(Landroid/view/View$OnFocusChangeListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) view.onFocusChangeListener = listener;
  },
  'hasOnLongClickListeners()Z': (self) => !!viewOf(self)?.listeners?.longClick,
  'getOnLongClickListener()Landroid/view/View$OnLongClickListener;': (self) => viewOf(self)?.listeners?.longClick ?? null,
  'setOnLongClickListener(Landroid/view/View$OnLongClickListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) {
      if (!view.listeners) view.listeners = {};
      view.listeners.longClick = listener;
      view.longClickable = !!listener;
    }
  },
  'isLaidOut()Z': (self) => {
    const view = viewOf(self);
    return !!view && view.right > view.left && view.bottom > view.top;
  },
  'isLayoutValid()Z': (self) => {
    const view = viewOf(self);
    return !!view && !view.$layoutRequested;
  },
  'getWindowToken()Landroid/os/IBinder;': (self) => viewOf(self)?.windowToken ?? null,
  'getApplicationWindowToken()Landroid/os/IBinder;': (self) => viewOf(self)?.windowToken ?? null,
  'setCameraDistance(F)V': (self, [distance]) => {
    const view = viewOf(self);
    if (view) view.cameraDistance = Number(distance) || 0;
  },
  'getCameraDistance()F': (self) => Number(viewOf(self)?.cameraDistance) || 0,
  'setTransitionName(Ljava/lang/String;)V': (self, [name]) => {
    const view = viewOf(self);
    if (view) view.transitionName = name ?? null;
  },
  'getTransitionName()Ljava/lang/String;': (self) => viewOf(self)?.transitionName ?? null,
  'setTag(ILjava/lang/Object;)V': (self, [key, tag]) => viewOf(self)?.setTag?.(tag, key),
  'getTag(I)Ljava/lang/Object;': (self, [key]) => viewOf(self)?.getTag?.(key) ?? null,
  'findViewWithTag(Ljava/lang/Object;)Landroid/view/View;': (self, [tag]) => {
    const root = viewOf(self);
    return walkViews(root, (view) => (view.tag === tag ? view.$javaObject ?? null : null));
  },
  'isFocusable()Z': (self) => !!viewOf(self)?.focusable,
  'setFocusable(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.focusable = !!value;
  },
  'isFocusableInTouchMode()Z': (self) => !!viewOf(self)?.focusableInTouchMode,
  'setFocusableInTouchMode(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.focusableInTouchMode = !!value;
  },
  'isClickable()Z': (self) => !!viewOf(self)?.clickable,
  'isLongClickable()Z': (self) => !!viewOf(self)?.longClickable,
  'setLongClickable(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.longClickable = !!value;
  },
  'isShown()Z': (self) => {
    let node = viewOf(self);
    while (node) {
      if (node.visibility !== 0) return false;
      node = node.parent;
    }
    return true;
  },
  'getAccessibilityClassName()Ljava/lang/CharSequence;': () => 'android.view.View',
  'getSolidColor()I': (self) => {
    const background = viewOf(self)?.background;
    return background && typeof background.color === 'number' ? background.color >>> 0 : 0;
  },
  'isAttachedToWindow()Z': (self) => {
    const view = viewOf(self);
    return !!view && (view.windowToken != null || !!view.parent);
  },
  'setAnimation(Landroid/view/animation/Animation;)V': (self, [animation]) => {
    const view = viewOf(self);
    if (view) view.animation = animation ?? null;
  },
  'getAnimation()Landroid/view/animation/Animation;': (self) => viewOf(self)?.animation ?? null,
  'isHardwareAccelerated()Z': (self) => viewOf(self)?.hardwareAccelerated ?? true,
  'getMeasuredState()I': () => 0,
  'getMatrix()Landroid/graphics/Matrix;': () => null,
  'getDisplay()Landroid/view/Display;': () => null,
  'announceForAccessibility(Ljava/lang/CharSequence;)V': () => {},
  'isInEditMode()Z': () => false,
  'getLayoutDirection()I': (self) => viewOf(self)?.layoutDirection ?? 0,
  'setLayoutDirection(I)V': (self, [direction]) => {
    const view = viewOf(self);
    if (view) view.layoutDirection = direction | 0;
  },
  'getVisibility()I': (self) => viewOf(self)?.visibility ?? 0,
  'setVisibility(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (!view) return;
    view.visibility = value | 0;
    view.requestLayout?.();
    view.invalidate?.();
  },
  'getAlpha()F': (self) => Number(viewOf(self)?.alpha ?? 1),
  'setAlpha(F)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.alpha = Number(value);
  },
  'setPressed(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) {
      view.pressed = !!value;
      view.refreshDrawableState?.();
    }
  },
  'isPressed()Z': (self) => !!viewOf(self)?.pressed,
  'setSelected(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) {
      view.selected = !!value;
      view.refreshDrawableState?.();
    }
  },
  'setActivated(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) {
      view.activated = !!value;
      view.refreshDrawableState?.();
    }
  },
  'getBaseline()I': (self) => viewOf(self)?.getBaseline?.() ?? -1,
  'getLayoutParams()Landroid/view/ViewGroup$LayoutParams;': (self) => viewOf(self)?.layoutParamsObject ?? viewOf(self)?.layoutParams ?? null,
  'getMeasuredWidth()I': (self) => viewOf(self)?.measuredWidth ?? 0,
  'getMeasuredHeight()I': (self) => viewOf(self)?.measuredHeight ?? 0,
  'getWidth()I': (self) => (viewOf(self)?.right ?? 0) - (viewOf(self)?.left ?? 0),
  'getHeight()I': (self) => (viewOf(self)?.bottom ?? 0) - (viewOf(self)?.top ?? 0),
  'getLeft()I': (self) => viewOf(self)?.left ?? 0,
  'getTop()I': (self) => viewOf(self)?.top ?? 0,
  'getRight()I': (self) => viewOf(self)?.right ?? 0,
  'getBottom()I': (self) => viewOf(self)?.bottom ?? 0,
  'getScrollX()I': (self) => viewOf(self)?.scrollX ?? 0,
  'getScrollY()I': (self) => viewOf(self)?.scrollY ?? 0,
  'setScrollX(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.scrollX = value | 0;
  },
  'setScrollY(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.scrollY = value | 0;
  },
  'setKeepScreenOn(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.keepScreenOn = !!value;
  },
  'getKeepScreenOn()Z': (self) => viewOf(self)?.keepScreenOn === true,
  'setScrollContainer(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.$scrollContainer = !!value;
  },
  'isScrollContainer()Z': (self) => viewOf(self)?.$scrollContainer === true,
  'setRevealOnFocusHint(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.revealOnFocusHint = !!value;
  },
  'getRevealOnFocusHint()Z': (self) => viewOf(self)?.revealOnFocusHint !== false,
  'setShowingLayoutBounds(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.$showingLayoutBounds = !!value;
  },
  'isShowingLayoutBounds()Z': (self) => viewOf(self)?.$showingLayoutBounds === true,
  'setNextFocusLeftId(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.nextFocusLeftId = id | 0; },
  'getNextFocusLeftId()I': (self) => viewOf(self)?.nextFocusLeftId ?? -1,
  'setNextFocusRightId(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.nextFocusRightId = id | 0; },
  'getNextFocusRightId()I': (self) => viewOf(self)?.nextFocusRightId ?? -1,
  'setNextFocusUpId(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.nextFocusUpId = id | 0; },
  'getNextFocusUpId()I': (self) => viewOf(self)?.nextFocusUpId ?? -1,
  'setNextFocusDownId(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.nextFocusDownId = id | 0; },
  'getNextFocusDownId()I': (self) => viewOf(self)?.nextFocusDownId ?? -1,
  'setNextFocusForwardId(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.nextFocusForwardId = id | 0; },
  'getNextFocusForwardId()I': (self) => viewOf(self)?.nextFocusForwardId ?? -1,
  'setNextClusterForwardId(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.nextClusterForwardId = id | 0; },
  'getNextClusterForwardId()I': (self) => viewOf(self)?.nextClusterForwardId ?? -1,
  'setDrawingCacheQuality(I)V': (self, [quality]) => {
    const view = viewOf(self);
    if (view) view.drawingCacheQuality = quality | 0;
  },
  'getDrawingCacheQuality()I': (self) => viewOf(self)?.drawingCacheQuality ?? 0,
  'setFadingEdgeLength(I)V': (self, [length]) => {
    const view = viewOf(self);
    if (view) view.fadingEdgeLength = length | 0;
  },
  'setVerticalScrollbarThumbDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => {
    const view = viewOf(self);
    if (view) view.scrollBarThumbVertical = drawable ?? null;
  },
  'getVerticalScrollbarThumbDrawable()Landroid/graphics/drawable/Drawable;': (self) => viewOf(self)?.scrollBarThumbVertical ?? null,
  'setVerticalScrollbarTrackDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => {
    const view = viewOf(self);
    if (view) view.scrollBarTrackVertical = drawable ?? null;
  },
  'getVerticalScrollbarTrackDrawable()Landroid/graphics/drawable/Drawable;': (self) => viewOf(self)?.scrollBarTrackVertical ?? null,
  'setHorizontalScrollbarThumbDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => {
    const view = viewOf(self);
    if (view) view.scrollBarThumbHorizontal = drawable ?? null;
  },
  'getHorizontalScrollbarThumbDrawable()Landroid/graphics/drawable/Drawable;': (self) => viewOf(self)?.scrollBarThumbHorizontal ?? null,
  'setHorizontalScrollbarTrackDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => {
    const view = viewOf(self);
    if (view) view.scrollBarTrackHorizontal = drawable ?? null;
  },
  'getHorizontalScrollbarTrackDrawable()Landroid/graphics/drawable/Drawable;': (self) => viewOf(self)?.scrollBarTrackHorizontal ?? null,
  'setAccessibilityPaneTitle(Ljava/lang/CharSequence;)V': (self, [title]) => {
    const view = viewOf(self);
    if (view) view.accessibilityPaneTitle = title ?? null;
  },
  'getAccessibilityPaneTitle()Ljava/lang/CharSequence;': (self) => viewOf(self)?.accessibilityPaneTitle ?? null,
  'setStateDescription(Ljava/lang/CharSequence;)V': (self, [description]) => {
    const view = viewOf(self);
    if (view) view.stateDescription = description ?? null;
  },
  'getStateDescription()Ljava/lang/CharSequence;': (self) => viewOf(self)?.stateDescription ?? null,
  'setAccessibilityTraversalBefore(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.accessibilityTraversalBefore = id | 0; },
  'getAccessibilityTraversalBefore()I': (self) => viewOf(self)?.accessibilityTraversalBefore ?? -1,
  'setAccessibilityTraversalAfter(I)V': (self, [id]) => { const view = viewOf(self); if (view) view.accessibilityTraversalAfter = id | 0; },
  'getAccessibilityTraversalAfter()I': (self) => viewOf(self)?.accessibilityTraversalAfter ?? -1,
  'hasExplicitFocusable()Z': (self) => viewOf(self)?.focusable === true,
  'onFocusChanged(ZILandroid/graphics/Rect;)V': (self, [gainFocus]) => {
    const view = viewOf(self);
    if (!view) return;
    view.focused = !!gainFocus;
    view.refreshDrawableState?.();
  },
  'onFocusLost()V': (self) => {
    const view = viewOf(self);
    if (!view) return;
    view.focused = false;
    view.refreshDrawableState?.();
  },
  'startActionMode(Landroid/view/ActionMode$Callback;I)Landroid/view/ActionMode;': () => null,
  'getBoundsOnScreen(Landroid/graphics/Rect;)V': (self, [rect]) => viewOf(self)?.getBoundsOnScreen?.(rect, false),
  'getBoundsOnScreen(Landroid/graphics/Rect;Z)V': (self, [rect, clip]) => viewOf(self)?.getBoundsOnScreen?.(rect, !!clip),
  'mapRectFromViewToScreenCoords(Landroid/graphics/RectF;Z)V': (self, [rect, clip]) => viewOf(self)?.mapRectFromViewToScreenCoords?.(rect, !!clip),
  'getHotspotBounds(Landroid/graphics/Rect;)V': (self, [rect]) => viewOf(self)?.getHotspotBounds?.(rect),
  'isVisibleToUser()Z': (self) => viewOf(self)?.isVisibleToUser?.() ?? false,
  'isVisibleToUser(Landroid/graphics/Rect;)Z': (self, [rect]) => viewOf(self)?.isVisibleToUser?.(rect) ?? false,
  'isVisibleToUserForAutofill(I)Z': (self) => viewOf(self)?.isVisibleToUser?.() ?? false,
  'isImportantForAutofill()Z': () => false,
  'getAutofillType()I': () => 0,
  'getAutofillHints()[Ljava/lang/String;': () => null,
  'isAutofilled()Z': () => false,
  'hideAutofillHighlight()Z': () => false,
  'getAutofillValue()Landroid/view/autofill/AutofillValue;': () => null,
  'getAutofillId()Landroid/view/autofill/AutofillId;': () => null,
  'setAutofillId(Landroid/view/autofill/AutofillId;)V': () => {},
  'autofill(Landroid/view/autofill/AutofillValue;)V': () => {},
  'autofill(Landroid/util/SparseArray;)V': () => {},
  'resetSubtreeAutofillIds()V': () => {},
  'canNotifyAutofillEnterExitEvent()Z': () => false,
  'setNotifyAutofillManagerOnClick(Z)V': () => {},
  'notifyEnterOrExitForAutoFillIfNeeded(Z)V': () => {},
  'getImportantForContentCapture()I': () => 0,
  'setImportantForContentCapture(I)V': () => {},
  'isImportantForContentCapture()Z': () => false,
  'getNotifiedContentCaptureAppeared()Z': () => false,
  'setContentCaptureSession(Landroid/view/contentcapture/ContentCaptureSession;)V': () => {},
  'getContentCaptureSession()Landroid/view/contentcapture/ContentCaptureSession;': () => null,
  'dispatchInitialProvideContentCaptureStructure()V': () => {},
  'initializeFadingEdge(Landroid/content/res/TypedArray;)V': () => {},
  'initializeFadingEdgeInternal(Landroid/content/res/TypedArray;)V': () => {},
  'initializeScrollbars(Landroid/content/res/TypedArray;)V': () => {},
  'initializeScrollbarsInternal(Landroid/content/res/TypedArray;)V': () => {},
  'addFrameMetricsListener(Landroid/view/Window;Landroid/view/Window$OnFrameMetricsAvailableListener;Landroid/os/Handler;)V': () => {},
  'removeFrameMetricsListener(Landroid/view/Window$OnFrameMetricsAvailableListener;)V': () => {},
  'performButtonActionOnTouchDown(Landroid/view/MotionEvent;)Z': () => false,
  'dispatchActivityResult(Ljava/lang/String;IILandroid/content/Intent;)Z': () => false,
  'onActivityResult(IILandroid/content/Intent;)V': () => {},
  'sendAccessibilityEvent(I)V': () => {},
  'sendAccessibilityEventInternal(I)V': () => {},
  'sendAccessibilityEventUnchecked(Landroid/view/accessibility/AccessibilityEvent;)V': () => {},
  'sendAccessibilityEventUncheckedInternal(Landroid/view/accessibility/AccessibilityEvent;)V': () => {},
  'dispatchPopulateAccessibilityEvent(Landroid/view/accessibility/AccessibilityEvent;)Z': () => false,
  'dispatchPopulateAccessibilityEventInternal(Landroid/view/accessibility/AccessibilityEvent;)Z': () => false,
  'onPopulateAccessibilityEvent(Landroid/view/accessibility/AccessibilityEvent;)V': () => {},
  'onPopulateAccessibilityEventInternal(Landroid/view/accessibility/AccessibilityEvent;)V': () => {},
  'onInitializeAccessibilityEvent(Landroid/view/accessibility/AccessibilityEvent;)V': () => {},
  'onInitializeAccessibilityEventInternal(Landroid/view/accessibility/AccessibilityEvent;)V': () => {},
  'onInitializeAccessibilityNodeInfo(Landroid/view/accessibility/AccessibilityNodeInfo;)V': () => {},
  'onInitializeAccessibilityNodeInfoInternal(Landroid/view/accessibility/AccessibilityNodeInfo;)V': () => {},
  'createAccessibilityNodeInfo()Landroid/view/accessibility/AccessibilityNodeInfo;': () => null,
  'createAccessibilityNodeInfoInternal()Landroid/view/accessibility/AccessibilityNodeInfo;': () => null,
  'getAccessibilityNodeProvider()Landroid/view/accessibility/AccessibilityNodeProvider;': () => null,
  'getAccessibilityViewId()I': () => 0,
  'getAutofillViewId()I': () => -1,
  'getAccessibilityWindowId()I': () => -1,
  'addExtraDataToAccessibilityNodeInfo(Landroid/view/accessibility/AccessibilityNodeInfo;Ljava/lang/String;Landroid/os/Bundle;)V': () => {},
  'onProvideStructure(Landroid/view/ViewStructure;)V': () => {},
  'onProvideAutofillStructure(Landroid/view/ViewStructure;I)V': () => {},
  'onProvideContentCaptureStructure(Landroid/view/ViewStructure;I)V': () => {},
  'onProvideStructure(Landroid/view/ViewStructure;II)V': () => {},
  'onProvideVirtualStructure(Landroid/view/ViewStructure;)V': () => {},
  'onProvideAutofillVirtualStructure(Landroid/view/ViewStructure;I)V': () => {},
  'dispatchProvideStructure(Landroid/view/ViewStructure;)V': () => {},
  'dispatchProvideAutofillStructure(Landroid/view/ViewStructure;I)V': () => {},
  'getAttributeResolutionStack(I)[I': () => null,
  'getAttributeSourceResourceMap()Ljava/util/Map;': () => null,
  'getExplicitStyle()I': () => 0,
  'fitSystemWindows(Landroid/graphics/Rect;)Z': (self, [insets]) => {
    const view = viewOf(self);
    if (!view) return false;
    view.fitsSystemWindows = true;
    return true;
  },
  'setWindowInsetsAnimationCallback(Landroid/view/WindowInsetsAnimation$Callback;)V': () => {},
  'hasWindowInsetsAnimationCallback()Z': () => false,
  'setOnReceiveContentListener([Ljava/lang/String;Landroid/view/OnReceiveContentListener;)V': () => {},
  'performReceiveContent(Landroid/view/ContentInfo;)Landroid/view/ContentInfo;': () => null,
  'onReceiveContent(Landroid/view/ContentInfo;)Landroid/view/ContentInfo;': () => null,
  'getReceiveContentMimeTypes()[Ljava/lang/String;': () => null,
};

const VIEW_GROUP_METHODS = {
  'getChildDrawingOrder(II)I': (_self, [_count, position]) => position | 0,
  'setChildrenDrawingOrderEnabled(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.childrenDrawingOrderEnabled = !!value;
  },
  'getChildrenDrawingOrderEnabled()Z': (self) => !!viewOf(self)?.childrenDrawingOrderEnabled,
  'setClipChildren(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.clipChildren = !!value;
  },
  'getClipChildren()Z': (self) => viewOf(self)?.clipChildren ?? true,
  'setClipToPadding(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.clipToPadding = !!value;
  },
  'getClipToPadding()Z': (self) => viewOf(self)?.clipToPadding ?? true,
  'bringChildToFront(Landroid/view/View;)V': (self, [child]) => {
    const view = viewOf(self);
    if (!view || !Array.isArray(view.children)) return;
    const index = view.children.findIndex((item) => item === child || item.$javaObject === child);
    if (index >= 0) view.children.push(...view.children.splice(index, 1));
  },
  'indexOfChild(Landroid/view/View;)I': (self, [child]) => {
    const view = viewOf(self);
    if (!view || !Array.isArray(view.children)) return -1;
    return view.children.findIndex((item) => item === child || item.$javaObject === child);
  },
  'getDescendantFocusability()I': (self) => viewOf(self)?.descendantFocusability ?? 0,
  'setDescendantFocusability(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.descendantFocusability = value | 0;
  },
  'requestDisallowInterceptTouchEvent(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.disallowIntercept = !!value;
  },
  'offsetDescendantRectToMyCoords(Landroid/view/View;Landroid/graphics/Rect;)V': (self, [child, rect]) => {
    const view = viewOf(self);
    if (!view || !rect) return;
    let node = child?.$peer?.view ?? child;
    let dx = 0;
    let dy = 0;
    while (node && node !== view) {
      dx += node.left || 0;
      dy += node.top || 0;
      node = node.parent;
    }
    rect.left = (Number(rect.left) || 0) + dx;
    rect.right = (Number(rect.right) || 0) + dx;
    rect.top = (Number(rect.top) || 0) + dy;
    rect.bottom = (Number(rect.bottom) || 0) + dy;
  },
  'getChildVisibleRect(Landroid/view/View;Landroid/graphics/Rect;Landroid/graphics/Point;)Z': (self, [child, rect]) => {
    const view = viewOf(self);
    const node = child?.$peer?.view ?? child;
    if (!view || !node || !rect) return false;
    const left = Math.max(Number(rect.left) || 0, 0);
    const top = Math.max(Number(rect.top) || 0, 0);
    const right = Math.min(Number(rect.right) || 0, node.right - node.left);
    const bottom = Math.min(Number(rect.bottom) || 0, node.bottom - node.top);
    rect.left = left;
    rect.top = top;
    rect.right = right;
    rect.bottom = bottom;
    return right > left && bottom > top;
  },
  'setMotionEventSplittingEnabled(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.motionEventSplittingEnabled = !!value;
  },
  'isMotionEventSplittingEnabled()Z': (self) => viewOf(self)?.motionEventSplittingEnabled ?? false,
  'getLayoutMode()I': (self) => viewOf(self)?.layoutMode ?? 0,
  'setLayoutMode(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.layoutMode = value | 0;
  },
  'setTransitionGroup(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.transitionGroup = !!value;
  },
  'isTransitionGroup()Z': (self) => viewOf(self)?.transitionGroup ?? false,
  'getChildCount()I': (self) => viewOf(self)?.children?.length ?? 0,
  'getChildAt(I)Landroid/view/View;': (self, [index]) => viewOf(self)?.children?.[index | 0]?.$javaObject ?? null,
};

const TEXT_VIEW_METHODS = {
  'getLayout()Landroid/text/Layout;': () => null,
  'getCompoundPaddingLeft()I': (self) => viewOf(self)?.compoundPadding?.().left ?? 0,
  'getCompoundPaddingRight()I': (self) => viewOf(self)?.compoundPadding?.().right ?? 0,
  'getCompoundPaddingTop()I': (self) => viewOf(self)?.compoundPadding?.().top ?? 0,
  'getCompoundPaddingBottom()I': (self) => viewOf(self)?.compoundPadding?.().bottom ?? 0,
  'getCompoundPaddingStart()I': (self) => viewOf(self)?.compoundPadding?.().left ?? 0,
  'getCompoundPaddingEnd()I': (self) => viewOf(self)?.compoundPadding?.().right ?? 0,
  'getTotalPaddingLeft()I': (self) => viewOf(self)?.compoundPadding?.().left ?? 0,
  'getTotalPaddingRight()I': (self) => viewOf(self)?.compoundPadding?.().right ?? 0,
  'getTotalPaddingTop()I': (self) => {
    const view = viewOf(self);
    return view ? (view.paddingTop || 0) + Math.round((Number(view.extraVerticalOffset) || 0) / 2) : 0;
  },
  'getTotalPaddingBottom()I': (self) => {
    const view = viewOf(self);
    return view ? (view.paddingBottom || 0) + Math.round((Number(view.extraVerticalOffset) || 0) / 2) : 0;
  },
  'getTotalPaddingStart()I': (self) => viewOf(self)?.compoundPadding?.().left ?? 0,
  'getTotalPaddingEnd()I': (self) => viewOf(self)?.compoundPadding?.().right ?? 0,
  'getExtendedPaddingTop()I': (self) => TEXT_VIEW_METHODS.getTotalPaddingTop(self),
  'getExtendedPaddingBottom()I': (self) => TEXT_VIEW_METHODS.getTotalPaddingBottom(self),
  'setCompoundDrawablesWithIntrinsicBounds(Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V':
    (self, [left, top, right, bottom]) => viewOf(self)?.setCompoundDrawables?.(left, top, right, bottom),
  'setCompoundDrawablesWithIntrinsicBounds(IIII)V': (self, [left, top, right, bottom]) =>
    viewOf(self)?.setCompoundDrawablesWithIntrinsicBounds?.(left, top, right, bottom),
  'getLineSpacingExtra()F': (self) => Number(viewOf(self)?.lineSpacingExtra) || 0,
  'getLineSpacingMultiplier()F': (self) => Number(viewOf(self)?.lineSpacingMultiplier) || 1,
  'getCurrentTextColor()I': (self) => {
    const view = viewOf(self);
    const color = view?.textColor;
    return typeof color === 'number' ? color >>> 0 : 0xff000000;
  },
  'getTextColors()Landroid/content/ColorStateList;': () => null,
  'setTextAppearance(Landroid/content/Context;I)V': (self, [_context, resId]) => {
    const view = viewOf(self);
    if (view && typeof view.applyTextAppearance === 'function') view.applyTextAppearance(resId | 0);
  },
  'getHighlightColor()I': (self) => {
    const color = viewOf(self)?.highlightColor;
    return typeof color === 'number' ? color >>> 0 : 0;
  },
  'setHighlightColor(I)V': (self, [color]) => {
    const view = viewOf(self);
    if (view) view.highlightColor = color >>> 0;
  },
  'setShadowLayer(FFFI)V': (self, [radius, dx, dy, color]) => {
    const view = viewOf(self);
    if (view) view.shadowLayer = { radius: Number(radius), dx: Number(dx), dy: Number(dy), color: color >>> 0 };
  },
  'getTypeface()Landroid/graphics/Typeface;': () => null,
  'setTypeface(Landroid/graphics/Typeface;)V': (self, [typeface]) => {
    const view = viewOf(self);
    if (view) view.typeface = typeface;
  },
  'length()I': (self) => String(viewOf(self)?.text ?? '').length,
  'getEditableText()Landroid/text/Editable;': () => null,
  'getDefaultEditable()Z': (self) => !!viewOf(self)?.editable,
  'getFreezesText()Z': (self) => !!viewOf(self)?.freezesText,
  'setFreezesText(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.freezesText = !!value;
  },
  'getLineHeight()I': (self) => viewOf(self)?.getLineHeight?.() ?? 0,
  'getLetterSpacing()F': (self) => Number(viewOf(self)?.letterSpacing) || 0,
  'setLetterSpacing(F)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.letterSpacing = Number(value) || 0;
  },
  'getTextSize()F': (self) => Number(viewOf(self)?.textSize) || 0,
  'setTextSize(F)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) {
      view.textSize = Number(value) || 0;
      view.requestLayout?.();
      view.invalidate?.();
    }
  },
  'getPaint()Landroid/text/TextPaint;': (self) => viewOf(self)?.getPaint?.() ?? null,
  'getMaxLines()I': (self) => viewOf(self)?.maxLines ?? -1,
  'setMaxLines(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) {
      view.maxLines = value | 0;
      view.invalidate?.();
    }
  },
  'setSingleLine(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) {
      view.maxLines = value ? 1 : -1;
      view.singleLine = !!value;
      view.requestLayout?.();
    }
  },
  'getAccessibilityClassName()Ljava/lang/CharSequence;': () => 'android.widget.TextView',
  'getTextScaleX()F': (self) => Number(viewOf(self)?.textScaleX ?? 1),
  'setTextScaleX(F)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.textScaleX = Number(value) || 0;
  },
  'getElegantTextHeight()Z': (self) => viewOf(self)?.elegantTextHeight === true,
  'setElegantTextHeight(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.elegantTextHeight = !!value;
  },
  'isElegantTextHeight()Z': (self) => viewOf(self)?.elegantTextHeight === true,
  'isFallbackLineSpacing()Z': (self) => viewOf(self)?.fallbackLineSpacing !== false,
  'setFallbackLineSpacing(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.fallbackLineSpacing = !!value;
  },
  'getFontFeatureSettings()Ljava/lang/String;': (self) => viewOf(self)?.fontFeatureSettings ?? null,
  'setFontFeatureSettings(Ljava/lang/String;)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.fontFeatureSettings = value ?? null;
  },
  'getFontVariationSettings()Ljava/lang/String;': () => null,
  'getBreakStrategy()I': (self) => viewOf(self)?.breakStrategy ?? 0,
  'setBreakStrategy(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.breakStrategy = value | 0;
  },
  'getHyphenationFrequency()I': (self) => viewOf(self)?.hyphenationFrequency ?? 0,
  'setHyphenationFrequency(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.hyphenationFrequency = value | 0;
  },
  'getJustificationMode()I': (self) => viewOf(self)?.justificationMode ?? 0,
  'setJustificationMode(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.justificationMode = value | 0;
  },
  'getTextMetricsParams()Landroid/text/PrecomputedText$Params;': () => null,
  'setTextMetricsParams(Landroid/text/PrecomputedText$Params;)V': () => {},
  'getTextLocale()Ljava/util/Locale;': (self) => viewOf(self)?.textLocale ?? null,
  'getTextLocales()Landroid/os/LocaleList;': () => null,
  'setTextLocale(Ljava/util/Locale;)V': (self, [locale]) => {
    const view = viewOf(self);
    if (view) view.textLocale = locale ?? null;
  },
  'onConfigurationChanged(Landroid/content/res/Configuration;)V': () => {},
  'getScaledTextSize()F': (self) => Number(viewOf(self)?.textSize ?? 0),
  'getTypefaceStyle()I': (self) => viewOf(self)?.textStyle ?? 0,
  'getTextSizeUnit()I': () => 2,
  'setFirstBaselineToTopHeight(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.firstBaselineToTopHeight = value | 0;
  },
  'getFirstBaselineToTopHeight()I': (self) => viewOf(self)?.firstBaselineToTopHeight ?? -1,
  'setLastBaselineToBottomHeight(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.lastBaselineToBottomHeight = value | 0;
  },
  'getLastBaselineToBottomHeight()I': (self) => viewOf(self)?.lastBaselineToBottomHeight ?? -1,
  'getAutoSizeTextType()I': () => 0,
  'setAutoSizeTextTypeWithDefaults(I)V': () => {},
  'setAutoSizeTextTypeUniformWithConfiguration(IIII)V': () => {},
  'setAutoSizeTextTypeUniformWithPresetSizes([II)V': () => {},
  'getAutoSizeStepGranularity()I': () => -1,
  'getAutoSizeMinTextSize()I': () => -1,
  'getAutoSizeMaxTextSize()I': () => -1,
  'getAutoSizeTextAvailableSizes()[I': () => null,
  'getAutoLinkMask()I': (self) => viewOf(self)?.autoLinkMask ?? 0,
  'setAutoLinkMask(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.autoLinkMask = value | 0;
  },
  'getLinksClickable()Z': (self) => viewOf(self)?.linksClickable !== false,
  'setLinksClickable(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.linksClickable = !!value;
  },
  'getUrls()[Landroid/text/style/URLSpan;': () => null,
  'getHint()Ljava/lang/CharSequence;': (self) => viewOf(self)?.hintText ?? null,
  'setHint(Ljava/lang/CharSequence;)V': (self, [value]) => {
    const view = viewOf(self);
    if (!view) return;
    view.hintText = value ?? null;
    view.invalidate?.();
  },
  'setHint(I)V': (self, [id], vm) => {
    const view = viewOf(self);
    if (!view) return;
    view.hintText = vm?.resources?.getString?.(id) ?? null;
    view.invalidate?.();
  },
  'setHintTextColor(I)V': (self, [color]) => {
    const view = viewOf(self);
    if (view) view.hintColor = color | 0;
  },
  'getHintTextColors()Landroid/content/res/ColorStateList;': () => null,
  'getCurrentHintTextColor()I': (self) => viewOf(self)?.hintColor ?? 0,
  'setLinkTextColor(I)V': () => {},
  'getLinkTextColors()Landroid/content/res/ColorStateList;': () => null,
  'getGravity()I': (self) => viewOf(self)?.gravity ?? 0,
  'getPaintFlags()I': (self) => viewOf(self)?.paintFlags ?? 0,
  'setPaintFlags(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.paintFlags = value | 0;
  },
  'setHorizontallyScrolling(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.horizontallyScrolling = !!value;
  },
  'getHorizontallyScrolling()Z': (self) => viewOf(self)?.horizontallyScrolling === true,
  'isHorizontallyScrollable()Z': (self) => viewOf(self)?.horizontallyScrolling === true,
  'setMinLines(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.minLines = value | 0;
  },
  'getMinLines()I': (self) => viewOf(self)?.minLines ?? 0,
  'setMinEms(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.minEms = value | 0;
  },
  'getMinEms()I': (self) => viewOf(self)?.minEms ?? -1,
  'setMaxEms(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.maxEms = value | 0;
  },
  'getMaxEms()I': (self) => viewOf(self)?.maxEms ?? -1,
  'setEms(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.ems = value | 0;
  },
  'setLines(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.linesCount = value | 0;
  },
  'setLineHeight(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.lineHeight = value | 0;
  },
  'setMinHeight(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.minHeight = value | 0;
  },
  'getMinHeight()I': (self) => viewOf(self)?.minHeight ?? 0,
  'setMaxHeight(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.maxHeight = value | 0;
  },
  'getMaxHeight()I': (self) => viewOf(self)?.maxHeight ?? 0,
  'setMinWidth(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.minWidth = value | 0;
  },
  'getMinWidth()I': (self) => viewOf(self)?.minWidth ?? 0,
  'setMaxWidth(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.maxWidth = value | 0;
  },
  'getMaxWidth()I': (self) => viewOf(self)?.maxWidth ?? 0,
  'isSingleLine()Z': (self) => viewOf(self)?.singleLine === true,
  'getInputType()I': (self) => viewOf(self)?.inputType ?? 0,
  'setInputType(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.inputType = value | 0;
  },
  'setRawInputType(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.inputType = value | 0;
  },
  'isAnyPasswordInputType()Z': (self) => {
    const type = viewOf(self)?.inputType ?? 0;
    const masked = type & 0xff0;
    return masked === 0x80 || masked === 0x90 || masked === 0xa0;
  },
  'getImeOptions()I': (self) => viewOf(self)?.imeOptions ?? 0,
  'setImeOptions(I)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.imeOptions = value | 0;
  },
  'setImeActionLabel(Ljava/lang/CharSequence;I)V': (self, [label, id]) => {
    const view = viewOf(self);
    if (!view) return;
    view.imeActionLabel = label ?? null;
    view.imeActionId = id | 0;
  },
  'getImeActionLabel()Ljava/lang/CharSequence;': (self) => viewOf(self)?.imeActionLabel ?? null,
  'getImeActionId()I': (self) => viewOf(self)?.imeActionId ?? 0,
  'setOnEditorActionListener(Landroid/widget/TextView$OnEditorActionListener;)V': (self, [listener]) => {
    const view = viewOf(self);
    if (view) view.onEditorActionListener = listener ?? null;
  },
  'onEditorAction(I)V': () => {},
  'setPrivateImeOptions(Ljava/lang/String;)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.privateImeOptions = value ?? null;
  },
  'getPrivateImeOptions()Ljava/lang/String;': (self) => viewOf(self)?.privateImeOptions ?? null,
  'getInputExtras(Z)Landroid/os/Bundle;': () => null,
  'setInputExtras(I)V': () => {},
  'setImeHintLocales(Landroid/os/LocaleList;)V': () => {},
  'getImeHintLocales()Landroid/os/LocaleList;': () => null,
  'getShowSoftInputOnFocus()Z': (self) => viewOf(self)?.showSoftInputOnFocus !== false,
  'setShowSoftInputOnFocus(Z)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.showSoftInputOnFocus = !!value;
  },
  'getShadowRadius()F': (self) => {
    const shadow = viewOf(self)?.textShadow;
    return Number(shadow?.radius) || 0;
  },
  'getShadowDx()F': (self) => Number(viewOf(self)?.textShadow?.dx) || 0,
  'getShadowDy()F': (self) => Number(viewOf(self)?.textShadow?.dy) || 0,
  'getShadowColor()I': (self) => viewOf(self)?.textShadow?.color ?? 0,
  'getError()Ljava/lang/CharSequence;': (self) => viewOf(self)?.errorText ?? null,
  'setError(Ljava/lang/CharSequence;)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.errorText = value ?? null;
  },
  'setError(Ljava/lang/CharSequence;Landroid/graphics/drawable/Drawable;)V': (self, [value]) => {
    const view = viewOf(self);
    if (view) view.errorText = value ?? null;
  },
  'setText([CII)V': (self, [chars, start, length]) => {
    const view = viewOf(self);
    if (!view) return;
    const data = Array.isArray(chars?.$data) ? chars.$data : [];
    const text = data.slice(start | 0, (start | 0) + (length | 0)).map((code) => String.fromCharCode(code & 0xffff)).join('');
    view.setText?.(text);
  },
  'setText(Ljava/lang/CharSequence;Landroid/widget/TextView$BufferType;)V': (self, [text]) => {
    viewOf(self)?.setText?.(textOf(text));
  },
  'setText(ILandroid/widget/TextView$BufferType;)V': (self, [id], vm) => {
    const view = viewOf(self);
    if (!view) return;
    view.setText?.(vm?.resources?.getString?.(id) ?? '');
  },
  'setTextKeepState(Ljava/lang/CharSequence;)V': (self, [text]) => {
    viewOf(self)?.setText?.(textOf(text));
  },
  'setTextKeepState(Ljava/lang/CharSequence;Landroid/widget/TextView$BufferType;)V': (self, [text]) => {
    viewOf(self)?.setText?.(textOf(text));
  },
  'append(Ljava/lang/CharSequence;II)V': (self, [text, start, end]) => {
    const view = viewOf(self);
    if (!view) return;
    const source = textOf(text);
    view.setText?.(`${view.text ?? ''}${source.slice(start | 0, end | 0)}`);
  },
  'setFilters([Landroid/text/InputFilter;)V': (self, [filters]) => {
    const view = viewOf(self);
    if (view) view.filters = filters ?? null;
  },
  'getFilters()[Landroid/text/InputFilter;': (self) => viewOf(self)?.filters ?? null,
  'setFrame(IIII)Z': (self, [left, top, right, bottom]) => {
    const view = viewOf(self);
    if (!view) return false;
    view.left = left | 0;
    view.top = top | 0;
    view.right = right | 0;
    view.bottom = bottom | 0;
    view.layoutDirty = true;
    return true;
  },
  'preloadFontCache()V': () => {},
  'getTransformed()Ljava/lang/CharSequence;': (self) => viewOf(self)?.text ?? null,
  'getUndoManager()Landroid/content/UndoManager;': () => null,
  'setUndoManager(Landroid/content/UndoManager;Ljava/lang/String;)V': () => {},
  'getEditorForTesting()Landroid/widget/Editor;': () => null,
  'getDefaultMovementMethod()Landroid/text/method/MovementMethod;': () => null,
  'getKeyListener()Landroid/text/method/KeyListener;': () => null,
  'setKeyListener(Landroid/text/method/KeyListener;)V': () => {},
  'setTransformationMethod(Landroid/text/method/TransformationMethod;)V': () => {},
  'getCompoundDrawables()[Landroid/graphics/drawable/Drawable;': (self) => {
    const view = viewOf(self);
    return view?.compoundDrawables ? view.compoundDrawables.slice() : null;
  },
  'getCompoundDrawablesRelative()[Landroid/graphics/drawable/Drawable;': (self) => {
    const view = viewOf(self);
    return view?.compoundDrawables ? view.compoundDrawables.slice() : null;
  },
  'setCompoundDrawablesRelativeWithIntrinsicBounds(Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V':
    (self, [left, top, right, bottom]) => viewOf(self)?.setCompoundDrawables?.(left, top, right, bottom),
  'setCompoundDrawablesRelativeWithIntrinsicBounds(IIII)V': (self, [left, top, right, bottom]) =>
    viewOf(self)?.setCompoundDrawablesWithIntrinsicBounds?.(left, top, right, bottom),
  'getCompoundDrawableTintList()Landroid/content/res/ColorStateList;': (self) => viewOf(self)?.compoundDrawableTint ?? null,
  'getCompoundDrawableTintMode()Landroid/graphics/PorterDuff$Mode;': () => null,
  'getCompoundDrawableTintBlendMode()Landroid/graphics/BlendMode;': () => null,
  'setCompoundDrawableTintBlendMode(Landroid/graphics/BlendMode;)V': () => {},
  'drawableHotspotChanged(FF)V': () => {},
  'onSaveInstanceState()Landroid/os/Parcelable;': () => null,
  'onRestoreInstanceState(Landroid/os/Parcelable;)V': () => {},
  'setEditableFactory(Landroid/text/Editable$Factory;)V': () => {},
  'setSpannableFactory(Landroid/text/Spannable$Factory;)V': () => {},
  'setTextSelectHandle(Landroid/graphics/drawable/Drawable;)V': () => {},
  'setTextSelectHandle(I)V': () => {},
  'getTextSelectHandle()Landroid/graphics/drawable/Drawable;': () => null,
  'setTextSelectHandleLeft(Landroid/graphics/drawable/Drawable;)V': () => {},
  'setTextSelectHandleLeft(I)V': () => {},
  'getTextSelectHandleLeft()Landroid/graphics/drawable/Drawable;': () => null,
  'setTextSelectHandleRight(Landroid/graphics/drawable/Drawable;)V': () => {},
  'setTextSelectHandleRight(I)V': () => {},
  'getTextSelectHandleRight()Landroid/graphics/drawable/Drawable;': () => null,
  'setTextCursorDrawable(Landroid/graphics/drawable/Drawable;)V': () => {},
  'setTextCursorDrawable(I)V': () => {},
  'getTextCursorDrawable()Landroid/graphics/drawable/Drawable;': () => null,
  'onPreDraw()Z': () => true,
  'onDetachedFromWindowInternal()V': () => {},
  'onScreenStateChanged(I)V': () => {},
  'isPaddingOffsetRequired()Z': () => false,
  'getLeftPaddingOffset()I': () => 0,
};

const CANVAS_METHODS = {
  'drawLines([FLandroid/graphics/Paint;)V': (self, [points, paint], vm) => {
    const data = readIntArray(points);
    const bits = readFloatBits(vm, points);
    const values = bits || data;
    for (let i = 0; i + 3 < values.length; i += 4) {
      self.canvas?.drawLine?.(values[i], values[i + 1], values[i + 2], values[i + 3], paint?.paint ?? paint);
    }
  },
  'drawLines([FILandroid/graphics/Paint;)V': (self, [points, offset, count, paint], vm) => {
    const values = readFloatBits(vm, points) || readIntArray(points);
    const start = (offset | 0) * 4;
    for (let i = start; i + 3 < start + (count | 0) * 4 && i + 3 < values.length; i += 4) {
      self.canvas?.drawLine?.(values[i], values[i + 1], values[i + 2], values[i + 3], paint?.paint ?? paint);
    }
  },
  'drawLines([FIILandroid/graphics/Paint;)V': (self, [points, offset, count, paint], vm) => {
    const values = readFloatBits(vm, points) || readIntArray(points);
    const start = offset | 0;
    for (let i = start; i + 3 < start + (count | 0) * 2 && i + 3 < values.length; i += 4) {
      self.canvas?.drawLine?.(values[i], values[i + 1], values[i + 2], values[i + 3], paint?.paint ?? paint);
    }
  },
  'drawPoints([FLandroid/graphics/Paint;)V': (self, [points, paint], vm) => {
    const values = readFloatBits(vm, points) || readIntArray(points);
    for (let i = 0; i + 1 < values.length; i += 2) {
      self.canvas?.drawPoint?.(values[i], values[i + 1], paint?.paint ?? paint);
    }
  },
  'drawPoints([FILandroid/graphics/Paint;)V': (self, [points, offset, count, paint], vm) => {
    const values = readFloatBits(vm, points) || readIntArray(points);
    const start = offset | 0;
    for (let i = start; i + 1 < start + (count | 0) * 2 && i + 1 < values.length; i += 2) {
      self.canvas?.drawPoint?.(values[i], values[i + 1], paint?.paint ?? paint);
    }
  },
  'drawPoints([FIILandroid/graphics/Paint;)V': (self, [points, offset, count, paint], vm) => {
    const values = readFloatBits(vm, points) || readIntArray(points);
    const start = offset | 0;
    for (let i = start; i + 1 < start + (count | 0) * 2 && i + 1 < values.length; i += 2) {
      self.canvas?.drawPoint?.(values[i], values[i + 1], paint?.paint ?? paint);
    }
  },
  'drawPaint(Landroid/graphics/Paint;)V': (self, [paint]) => {
    self.canvas?.drawRect?.(0, 0, self.canvas?.width ?? 0, self.canvas?.height ?? 0, paint?.paint ?? paint);
  },
  'scale(FFF)V': (self, [sx, sy, px]) => {
    self.canvas?.translate?.(px, px);
    self.canvas?.scale?.(sx, sy);
    self.canvas?.translate?.(-px, -px);
  },
  'rotate(FFF)V': (self, [degrees, px, py]) => {
    self.canvas?.translate?.(px, py);
    self.canvas?.rotate?.(degrees);
    self.canvas?.translate?.(-px, -py);
  },
  'skew(FF)V': (self, [sx, sy]) => {
    const context = self.canvas?.context;
    if (context?.transform) context.transform(1, Math.tan(Number(sx) || 0), Math.tan(Number(sy) || 0), 1, 0, 0);
  },
};

function readFloatBits(vm, value) {
  const peer = value?.$peer ?? value;
  if (peer && peer.$data && peer.$data.length) {
    return Array.from(peer.$data, (bits) => floatBitsToNumber(bits | 0));
  }
  if (Array.isArray(value)) return value;
  return null;
}

function fontMetrics(size) {
  return {
    ascent: -size * 0.93,
    descent: size * 0.24,
    leading: 0,
    top: -size * 1.05,
    bottom: size * 0.27,
  };
}

function writeMetrics(target, metrics, integer) {
  if (!target) return;
  const peer = target.$peer || target;
  const round = integer ? Math.round : (value) => value;
  peer.ascent = round(metrics.ascent);
  peer.descent = round(metrics.descent);
  peer.top = round(metrics.top);
  peer.bottom = round(metrics.bottom);
  peer.leading = round(metrics.leading);
}

function paintPeer(self) {
  return self?.paint ?? self;
}

const PAINT_METHODS = {
  'set(Landroid/graphics/Paint;)V': (self, [source]) => {
    const other = source?.paint ?? source?.$peer ?? source;
    if (!other) return;
    for (const key of ['color', 'textSize', 'antiAlias', 'strokeWidth', 'style', 'textAlign', 'typeface', 'letterSpacing', 'textScaleX', 'textSkewX', 'strokeJoin', 'strokeCap', 'colorFilter']) {
      if (other[key] !== undefined) paintPeer(self)[key] = other[key];
    }
  },
  'setTypeface(Landroid/graphics/Typeface;)Landroid/graphics/Typeface;': (self, [typeface]) => {
    const name = typeface?.$peer?.family ?? typeface?.family ?? null;
    if (name) paintPeer(self).typeface = name;
    return typeface ?? null;
  },
  'getTypeface()Landroid/graphics/Typeface;': () => null,
  'setStrokeMiter(F)V': (self, [value]) => {
    paintPeer(self).strokeMiter = Number(value) || 0;
  },
  'getStrokeMiter()F': (self) => Number(paintPeer(self).strokeMiter) || 0,
  'getFontMetrics(Landroid/graphics/Paint$FontMetrics;)F': (self, [target]) => {
    const metrics = fontMetrics(Number(paintPeer(self).textSize) || 0);
    writeMetrics(target, metrics, false);
    return metrics.descent - metrics.ascent;
  },
  'getFontMetricsInt(Landroid/graphics/Paint$FontMetricsInt;)I': (self, [target]) => {
    const metrics = fontMetrics(Number(paintPeer(self).textSize) || 0);
    writeMetrics(target, metrics, true);
    return Math.round(metrics.descent - metrics.ascent);
  },
  'getFontMetrics()Landroid/graphics/Paint$FontMetrics;': () => null,
  'getFontMetricsInt()Landroid/graphics/Paint$FontMetricsInt;': () => null,
  'ascent()F': (self) => fontMetrics(Number(paintPeer(self).textSize) || 0).ascent,
  'descent()F': (self) => fontMetrics(Number(paintPeer(self).textSize) || 0).descent,
  'getFontSpacing()F': (self) => {
    const metrics = fontMetrics(Number(paintPeer(self).textSize) || 0);
    return metrics.descent - metrics.ascent;
  },
  'getTextBounds(Ljava/lang/String;IILandroid/graphics/Rect;)V': (self, [text, start, end, rect]) => {
    const value = String(text ?? '').slice(start | 0, end | 0);
    const width = Math.ceil(paintPeer(self).measureText?.(value) ?? 0);
    const metrics = fontMetrics(Number(paintPeer(self).textSize) || 0);
    if (rect) {
      rect.left = 0;
      rect.top = Math.floor(metrics.ascent);
      rect.right = width;
      rect.bottom = Math.ceil(metrics.descent);
    }
  },
  'getTextWidths(Ljava/lang/String;[F)I': (self, [text, widths]) => {
    const value = String(text ?? '');
    const data = widths?.$data || widths || [];
    for (let i = 0; i < value.length && i < data.length; i++) data[i] = paintPeer(self).measureText?.(value[i]) ?? 0;
    return Math.min(value.length, data.length);
  },
  'getTextWidths(Ljava/lang/String;II[F)I': (self, [text, start, end, widths]) => {
    const value = String(text ?? '').slice(start | 0, end | 0);
    const data = widths?.$data || widths || [];
    for (let i = 0; i < value.length && i < data.length; i++) data[i] = paintPeer(self).measureText?.(value[i]) ?? 0;
    return Math.min(value.length, data.length);
  },
  'measureText(Ljava/lang/CharSequence;II)F': (self, [text, start, end]) =>
    paintPeer(self).measureText?.(String(text ?? '').slice(start | 0, end | 0)) ?? 0,
  'measureText([CII)F': (self, [chars, start, end]) => {
    const data = chars?.$data || chars || [];
    let value = '';
    for (let i = start | 0; i < (end | 0) && i < data.length; i++) value += String.fromCharCode(data[i]);
    return paintPeer(self).measureText?.(value) ?? 0;
  },
  'getLetterSpacing()F': (self) => Number(paintPeer(self).letterSpacing) || 0,
  'setLetterSpacing(F)V': (self, [value]) => {
    paintPeer(self).letterSpacing = Number(value) || 0;
  },
  'setShadowLayer(FFFI)V': (self, [radius, dx, dy, color]) => paintPeer(self).setShadowLayer?.(radius, dx, dy, color),
  'clearShadowLayer()V': (self) => paintPeer(self).clearShadowLayer?.(),
  'setTextSkewX(F)V': (self, [value]) => {
    paintPeer(self).textSkewX = Number(value) || 0;
  },
  'getTextSkewX()F': (self) => Number(paintPeer(self).textSkewX) || 0,
  'setTextScaleX(F)V': (self, [value]) => {
    paintPeer(self).textScaleX = Number(value) || 1;
  },
  'getTextScaleX()F': (self) => Number(paintPeer(self).textScaleX) || 1,
  'setFakeBoldText(Z)V': (self, [value]) => {
    paintPeer(self).fakeBoldText = !!value;
  },
  'isFakeBoldText()Z': (self) => !!paintPeer(self).fakeBoldText,
  'setUnderlineText(Z)V': (self, [value]) => {
    paintPeer(self).underlineText = !!value;
  },
  'isUnderlineText()Z': (self) => !!paintPeer(self).underlineText,
  'setStrikeThruText(Z)V': (self, [value]) => {
    paintPeer(self).strikeThruText = !!value;
  },
  'isStrikeThruText()Z': (self) => !!paintPeer(self).strikeThruText,
  'setSubpixelText(Z)V': (self, [value]) => {
    paintPeer(self).subpixelText = !!value;
  },
  'isSubpixelText()Z': (self) => !!paintPeer(self).subpixelText,
  'setFilterBitmap(Z)V': (self, [value]) => {
    paintPeer(self).filterBitmap = !!value;
  },
  'isFilterBitmap()Z': (self) => paintPeer(self).filterBitmap ?? true,
  'setDither(Z)V': (self, [value]) => {
    paintPeer(self).dither = !!value;
  },
  'isDither()Z': (self) => !!paintPeer(self).dither,
  'setLinearText(Z)V': (self, [value]) => {
    paintPeer(self).linearText = !!value;
  },
  'getFillPath(Landroid/graphics/Path;Landroid/graphics/Path;)Z': () => false,
  'setMaskFilter(Landroid/graphics/MaskFilter;)V': (self, [value]) => {
    paintPeer(self).maskFilter = value ?? null;
  },
  'setPathEffect(Landroid/graphics/PathEffect;)V': (self, [value]) => {
    paintPeer(self).pathEffect = value ?? null;
  },
  'getPathEffect()Landroid/graphics/PathEffect;': (self) => paintPeer(self).pathEffect ?? null,
  'setXfermode(Landroid/graphics/Xfermode;)V': (self, [value]) => {
    paintPeer(self).xfermode = value ?? null;
  },
  'getXfermode()Landroid/graphics/Xfermode;': (self) => paintPeer(self).xfermode ?? null,
  'reset()V': (self) => {
    paintPeer(self).color = 0xff000000;
    paintPeer(self).style = 'fill';
    paintPeer(self).strokeWidth = 1;
    paintPeer(self).textSize = 14;
    paintPeer(self).alpha = undefined;
    paintPeer(self).colorFilter = null;
    paintPeer(self).shadow = null;
    paintPeer(self).shader = null;
  },
  'hasGlyph(I)Z': () => true,
};

function bitmapSelf(self) {
  if (!self) return self;
  return self.image !== undefined ? self : (self.bitmap ?? self);
}

const BITMAP_METHODS = {
  'getRowBytes()I': (self) => (Number(bitmapSelf(self).width) || 0) * 4,
  'getByteCount()I': (self) => (Number(bitmapSelf(self).width) || 0) * (Number(bitmapSelf(self).height) || 0) * 4,
  'getAllocationByteCount()I': (self) => BITMAP_METHODS.getByteCount(self),
  'hasAlpha()Z': (self) => Number(bitmapSelf(self).config) !== 0,
  'getDensity()I': (self) => Number(bitmapSelf(self).density) || 160,
  'setDensity(I)V': (self, [value]) => {
    bitmapSelf(self).density = value | 0;
  },
  'isRecycled()Z': (self) => !bitmapSelf(self).image,
  'recycle()V': (self) => {
    bitmapSelf(self).image = null;
  },
  'getPixels([IIIIIII)V': (self, [pixels, offset, stride, x, y, width, height]) => {
    const data = pixels?.$data || pixels || [];
    const target = Number(stride) || width;
    for (let row = 0; row < (height | 0); row++) {
      for (let column = 0; column < (width | 0); column++) {
        data[(offset | 0) + row * target + column] = 0;
      }
    }
    void x;
    void y;
  },
  'setPixels([IIIIIII)V': () => {},
  'extractAlpha()Landroid/graphics/Bitmap;': (self) => self,
  'copy(Landroid/graphics/Bitmap$Config;Z)Landroid/graphics/Bitmap;': (self) => self,
};

const BITMAP_STATIC_METHODS = {
  'createScaledBitmap(Landroid/graphics/Bitmap;IIZ)Landroid/graphics/Bitmap;': (self, [source, width, height], vm) =>
    scaledBitmap(vm, source, width, height),
  'createBitmap(Landroid/graphics/Bitmap;IIII)Landroid/graphics/Bitmap;': (self, [source, x, y, width, height], vm) => {
    const bitmap = scaledBitmap(vm, source, width, height);
    void x;
    void y;
    return bitmap;
  },
  'createBitmap(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;': (self, [width, height], vm) =>
    scaledBitmap(vm, null, width, height),
};

function scaledBitmap(vm, source, width, height) {
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const peer = bitmapPeer(source);
  const image = peer?.image ?? null;
  const bitmap = new Bitmap(image, Number(width) | 0, Number(height) | 0, peer?.source);
  const object = vm.allocateRawObject('Landroid/graphics/Bitmap;');
  object.$peer = bitmap;
  return object;
}

const MOTION_EVENT_METHODS = {
  'getActionMasked()I': (self) => (Number(self.action) | 0) & 0xff,
  'getActionIndex()I': (self) => ((Number(self.action) | 0) & 0xff00) >> 8,
  'getPointerCount()I': (self) => Number(self.pointerCount) || 1,
  'getPointerId(I)I': (_self, [index]) => index | 0,
  'getX(I)F': (self, [index]) => (index | 0) === 0 ? Number(self.x) || 0 : 0,
  'getY(I)F': (self, [index]) => (index | 0) === 0 ? Number(self.y) || 0 : 0,
  'getPressure(I)F': (self, [index]) => ((index | 0) === 0 ? 1 : 0),
  'getSize(I)F': (self, [index]) => ((index | 0) === 0 ? 1 : 0),
  'getToolType(I)I': () => 1,
  'getAxisValue(I)F': (self, [axis]) => {
    const values = self.axisValues;
    if (values && typeof values === 'object' && axis in values) return Number(values[axis]) || 0;
    return 0;
  },
  'setAction(I)V': (self, [action]) => {
    self.action = action | 0;
  },
  'setLocation(FF)V': (self, [x, y]) => {
    self.x = Number(x) || 0;
    self.y = Number(y) || 0;
  },
  'offsetLocation(FF)V': (self, [dx, dy]) => {
    self.x = (Number(self.x) || 0) + (Number(dx) || 0);
    self.y = (Number(self.y) || 0) + (Number(dy) || 0);
  },
  'getHistoricalX(I)F': (self, [index]) => MOTION_EVENT_METHODS.getX(self, [index]),
  'getHistoricalY(I)F': (self, [index]) => MOTION_EVENT_METHODS.getY(self, [index]),
  'getHistoricalEventTime(I)J': (self) => Number(self.eventTime) || 0,
  'recycle()V': () => {},
  'getFlags()I': (self) => Number(self.flags) || 0,
  'setSource(I)V': (self, [source]) => {
    self.source = source | 0;
  },
};

const MOTION_EVENT_STATIC_METHODS = {
  'obtain(Landroid/view/MotionEvent;)Landroid/view/MotionEvent;': (_self, [source]) => source,
  'obtain(JJIFFI)Landroid/view/MotionEvent;': (self, [downTime, eventTime, action, x, y, metaState], vm) =>
    obtainEvent(vm, { downTime, eventTime, action, x, y, metaState }),
  'obtain(JJIIFFFFIIIIFFFIFFIII)Landroid/view/MotionEvent;': (self, [downTime, eventTime, action, pointerCount, x, y, pressure, size, metaState, xPrecision, yPrecision, deviceId, edgeFlags, source, flags], vm) =>
    obtainEvent(vm, { downTime, eventTime, action, pointerCount, x, y, pressure, size, metaState, xPrecision, yPrecision, deviceId, edgeFlags, source, flags }),
  'isTouchEvent(Landroid/view/MotionEvent;)Z': () => true,
};

function obtainEvent(vm, values) {
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const object = vm.allocateRawObject('Landroid/view/MotionEvent;');
  object.$peer = {
    action: values.action | 0,
    x: Number(values.x) || 0,
    y: Number(values.y) || 0,
    rawX: Number(values.x) || 0,
    rawY: Number(values.y) || 0,
    downTime: Number(values.downTime) || 0,
    eventTime: Number(values.eventTime) || 0,
    pointerCount: Number(values.pointerCount) || 1,
    edgeFlags: Number(values.edgeFlags) || 0,
    source: Number(values.source) || 0,
  };
  return object;
}

const INTENT_METHODS = {
  'getExtras()Landroid/os/Bundle;': (self) => bundleFor(self),
  'getLongExtra(Ljava/lang/String;J)J': (self, [key, fallback]) => Number(self.extras?.get?.(key)) || fallback || 0,
  'getFloatExtra(Ljava/lang/String;F)F': (self, [key, fallback]) => Number(self.extras?.get?.(key)) || fallback || 0,
  'getDoubleExtra(Ljava/lang/String;D)D': (self, [key, fallback]) => Number(self.extras?.get?.(key)) || fallback || 0,
  'getShortExtra(Ljava/lang/String;S)S': (self, [key, fallback]) => Number(self.extras?.get?.(key)) ?? fallback,
  'getByteExtra(Ljava/lang/String;B)B': (self, [key, fallback]) => Number(self.extras?.get?.(key)) ?? fallback,
  'getCharExtra(Ljava/lang/String;C)C': (self, [key, fallback]) => Number(self.extras?.get?.(key)) ?? fallback,
  'getCharSequenceExtra(Ljava/lang/String;)Ljava/lang/CharSequence;': (self, [key]) => self.extras?.get?.(key) ?? null,
  'getStringArrayExtra(Ljava/lang/String;)[Ljava/lang/String;': (self, [key]) => self.extras?.get?.(key) ?? null,
  'getIntArrayExtra(Ljava/lang/String;)[I': (self, [key]) => self.extras?.get?.(key) ?? null,
  'getParcelableExtra(Ljava/lang/String;)Landroid/os/Parcelable;': (self, [key]) => self.extras?.get?.(key) ?? null,
  'getSerializableExtra(Ljava/lang/String;)Ljava/io/Serializable;': (self, [key]) => self.extras?.get?.(key) ?? null,
  'putExtra(Ljava/lang/String;C)Landroid/content/Intent;': (self, [key, value]) => putExtra(self, key, value),
  'putExtra(Ljava/lang/String;B)Landroid/content/Intent;': (self, [key, value]) => putExtra(self, key, value),
  'putExtra(Ljava/lang/String;S)Landroid/content/Intent;': (self, [key, value]) => putExtra(self, key, value),
  'putExtra(Ljava/lang/String;[I)Landroid/content/Intent;': (self, [key, value]) => putExtra(self, key, value),
  'putExtra(Ljava/lang/String;[Ljava/lang/String;)Landroid/content/Intent;': (self, [key, value]) => putExtra(self, key, value),
  'putExtra(Ljava/lang/String;Landroid/os/Bundle;)Landroid/content/Intent;': (self, [key, value]) => putExtra(self, key, value),
  'putExtra(Ljava/lang/String;Ljava/io/Serializable;)Landroid/content/Intent;': (self, [key, value]) => putExtra(self, key, value),
  'putExtras(Landroid/os/Intent;)Landroid/content/Intent;': (self, [other]) => {
    if (other?.extras?.forEach) other.extras.forEach((value, key) => self.extras.set(key, value));
    return self;
  },
};
INTENT_METHODS['addCategory(Ljava/lang/String;)Landroid/content/Intent;'] = (self, [category]) => {
  if (!Array.isArray(self.categories)) self.categories = [];
  self.categories.push(String(category ?? ''));
  return self;
};
INTENT_METHODS['getCategories()Ljava/util/Set;'] = (self) => self.categories ?? null;
INTENT_METHODS['replaceExtras(Landroid/os/Bundle;)Landroid/content/Intent;'] = (self, [bundle]) => {
  self.extras = bundle?.extras ?? new Map();
  return self;
};
INTENT_METHODS['removeExtra(Ljava/lang/String;)V'] = (self, [key]) => {
  self.extras?.delete?.(String(key ?? ''));
};
INTENT_METHODS['hasExtra(Ljava/lang/String;)Z'] = (self, [key]) => !!self.extras?.has?.(key);
INTENT_METHODS['getBooleanExtra(Ljava/lang/String;Z)Z'] = (self, [key, fallback]) => {
  const value = self.extras?.get?.(key);
  return value === undefined ? !!fallback : !!value;
};
INTENT_METHODS['getIntExtra(Ljava/lang/String;I)I'] = (self, [key, fallback]) => {
  const value = self.extras?.get?.(key);
  return value === undefined ? fallback | 0 : value | 0;
};
INTENT_METHODS['getStringExtra(Ljava/lang/String;)Ljava/lang/String;'] = (self, [key]) => {
  const value = self.extras?.get?.(key);
  return typeof value === 'string' ? value : value === undefined ? null : String(value);
};

function putExtra(self, key, value) {
  if (!self.extras) self.extras = new Map();
  self.extras.set(String(key ?? ''), value);
  return self;
}

function bundleFor(intent) {
  if (!intent.extras) return null;
  if (intent.$bundle) return intent.$bundle;
  const bundle = { $descriptor: 'Landroid/os/Bundle;', extras: intent.extras };
  intent.$bundle = bundle;
  return bundle;
}

const DIALOG_METHODS = {
  'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => {
    const view = self.view ?? self;
    if (view) view.title = title ?? null;
  },
  'getTitle()Ljava/lang/CharSequence;': (self) => (self.view ?? self)?.title ?? null,
  'setCancelable(Z)V': (self, [value]) => {
    if (self.view) self.view.cancelable = !!value;
  },
  'setCanceledOnTouchOutside(Z)V': (self, [value]) => {
    if (self.view) self.view.canceledOnTouchOutside = !!value;
  },
  'setOnDismissListener(Landroid/content/DialogInterface$OnDismissListener;)V': (self, [listener]) => {
    if (self.view) self.view.onDismissListener = listener;
  },
  'setOnCancelListener(Landroid/content/DialogInterface$OnCancelListener;)V': (self, [listener]) => {
    if (self.view) self.view.onCancelListener = listener;
  },
  'setOnShowListener(Landroid/content/DialogInterface$OnShowListener;)V': (self, [listener]) => {
    if (self.view) self.view.onShowListener = listener;
  },
  'setContentView(Landroid/view/View;)V': (self, [content]) => {
    const view = self.view;
    if (view && typeof view.setContentView === 'function') view.setContentView(content);
  },
  'isShowing()Z': (self) => !!self.view?.showing,
};

const WEBVIEW_METHODS = {
  'canGoBack()Z': () => false,
  'canGoForward()Z': () => false,
  'canGoBackOrForward(I)Z': () => false,
  'goBack()V': () => undefined,
  'goForward()V': () => undefined,
  'goBackOrForward(I)V': () => undefined,
  'stopLoading()V': () => undefined,
  'clearView()V': () => undefined,
  'clearFormData()V': () => undefined,
  'clearMatches()V': () => undefined,
  'clearSslPreferences()V': () => undefined,
  'destroy()V': (self) => {
    if (self.view) self.view.destroyed = true;
  },
  'getProgress()I': () => 100,
  'getContentHeight()I': (self) => viewOf(self)?.height ?? 0,
  'getOriginalUrl()Ljava/lang/String;': (self) => viewOf(self)?.getUrl?.() ?? '',
  'getFavicon()Landroid/graphics/Bitmap;': () => null,
  'getCertificate()Landroid/net/http/SslCertificate;': () => null,
  'setCertificate(Landroid/net/http/SslCertificate;)V': () => undefined,
  'getScale()F': () => 1,
  'canZoomIn()Z': () => false,
  'canZoomOut()Z': () => false,
  'zoomIn()Z': () => false,
  'zoomOut()Z': () => false,
  'zoomBy(F)Z': () => false,
  'pageUp(Z)Z': () => false,
  'pageDown(Z)Z': () => false,
  'flingScroll(II)V': () => undefined,
  'findAll(Ljava/lang/String;)I': () => 0,
  'findAllAsync(Ljava/lang/String;)V': () => undefined,
  'findNext(Z)V': () => undefined,
  'setFindListener(Landroid/webkit/WebView$FindListener;)V': () => undefined,
  'setDownloadListener(Landroid/webkit/DownloadListener;)V': (self, [listener]) => {
    if (self.view) self.view.downloadListener = listener ?? null;
  },
  'getWebViewClient()Landroid/webkit/WebViewClient;': (self) => viewOf(self)?.webViewClient ?? null,
  'getWebChromeClient()Landroid/webkit/WebChromeClient;': (self) => viewOf(self)?.webChromeClient ?? null,
  'addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V': (self, [object, name]) => {
    const view = viewOf(self);
    if (!view) return;
    if (!view.javascriptInterfaces) view.javascriptInterfaces = new Map();
    view.javascriptInterfaces.set(String(name ?? ''), object ?? null);
  },
  'removeJavascriptInterface(Ljava/lang/String;)V': (self, [name]) => {
    viewOf(self)?.javascriptInterfaces?.delete?.(String(name ?? ''));
  },
  'evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V': (self, [script]) => {
    const view = viewOf(self);
    if (view) view.lastEvaluatedScript = String(script ?? '');
  },
  'postUrl(Ljava/lang/String;[B)V': (self, [url]) => viewOf(self)?.loadUrl?.(String(url ?? '')),
  'setNetworkAvailable(Z)V': (self, [value]) => {
    if (viewOf(self)) viewOf(self).networkAvailable = !!value;
  },
  'getRendererRequestedPriority()I': () => 0,
  'setRendererPriorityPolicy(IZ)V': () => undefined,
  'getRendererPriorityWaivedWhenNotVisible()Z': () => false,
  'setWebViewRenderProcessClient(Landroid/webkit/WebViewRenderProcessClient;)V': () => undefined,
  'setWebViewRenderProcessClient(Ljava/util/concurrent/Executor;Landroid/webkit/WebViewRenderProcessClient;)V': () => undefined,
  'getWebViewRenderProcessClient()Landroid/webkit/WebViewRenderProcessClient;': () => null,
  'getWebViewRenderProcess()Landroid/webkit/WebViewRenderProcess;': () => null,
  'getWebViewLooper()Landroid/os/Looper;': () => null,
  'getWebViewClassLoader()Ljava/lang/ClassLoader;': () => null,
  'isPrivateBrowsingEnabled()Z': () => false,
  'requestFocusNodeHref(Landroid/os/Message;)V': () => undefined,
  'requestImageRef(Landroid/os/Message;)V': () => undefined,
  'documentHasImages(Landroid/os/Message;)V': () => undefined,
  'saveState(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;': () => null,
  'restoreState(Landroid/os/Bundle;)Landroid/webkit/WebBackForwardList;': () => null,
  'saveWebArchive(Ljava/lang/String;)V': () => undefined,
  'saveWebArchive(Ljava/lang/String;ZLandroid/webkit/ValueCallback;)V': () => undefined,
  'createPrintDocumentAdapter(Ljava/lang/String;)Landroid/print/PrintDocumentAdapter;': () => null,
  'capturePicture()Landroid/graphics/Picture;': () => null,
  'postVisualStateCallback(JLandroid/webkit/WebView$VisualStateCallback;)V': () => undefined,
  'onPause()V': () => undefined,
  'onResume()V': () => undefined,
  'pauseTimers()V': () => undefined,
  'resumeTimers()V': () => undefined,
  'freeMemory()V': () => undefined,
  'overlayHorizontalScrollbar()Z': () => true,
  'overlayVerticalScrollbar()Z': () => true,
  'setHorizontalScrollbarOverlay(Z)V': () => undefined,
  'setVerticalScrollbarOverlay(Z)V': () => undefined,
  'setScrollBarStyle(I)V': () => undefined,
  'setMapTrackballToArrowKeys(Z)V': () => undefined,
  'getHitTestResult()Landroid/webkit/WebView$HitTestResult;': () => null,
  'getTextClassifier()Landroid/view/textclassifier/TextClassifier;': () => null,
  'setTextClassifier(Landroid/view/textclassifier/TextClassifier;)V': () => undefined,
  'computeHorizontalScrollRange()I': (self) => viewOf(self)?.width ?? 0,
  'computeVerticalScrollRange()I': (self) => viewOf(self)?.height ?? 0,
  'computeHorizontalScrollOffset()I': () => 0,
  'computeVerticalScrollOffset()I': () => 0,
  'computeHorizontalScrollExtent()I': (self) => viewOf(self)?.width ?? 0,
  'computeVerticalScrollExtent()I': (self) => viewOf(self)?.height ?? 0,
};

const WEBVIEW_STATIC_METHODS = {
  'setWebContentsDebuggingEnabled(Z)V': () => undefined,
  'setDataDirectorySuffix(Ljava/lang/String;)V': () => undefined,
  'disableWebView()V': () => undefined,
  // 应用常用它判断 WebView 是否安装；返回 null 会被当成「未安装」并弹框拒绝启动。
  'getCurrentWebViewPackage()Landroid/content/pm/PackageInfo;': (_self, _args, vm) => {
    const info = vm.allocateRawObject('Landroid/content/pm/PackageInfo;');
    info.$peer = {
      vm,
      constructor: { $descriptor: 'Landroid/content/pm/PackageInfo;' },
      packageName: 'com.android.webview',
      versionName: '120.0.6099.230',
      versionCode: 6099230,
      firstInstallTime: 0,
      lastUpdateTime: 0,
    };
    return info;
  },
  'startSafeBrowsing(Landroid/content/Context;Landroid/webkit/ValueCallback;)V': () => undefined,
  'setSafeBrowsingWhitelist(Ljava/util/List;Landroid/webkit/ValueCallback;)V': () => undefined,
  'getSafeBrowsingPrivacyPolicyUrl()Landroid/net/Uri;': () => null,
  'clearClientCertPreferences(Ljava/lang/Runnable;)V': (_self, [callback], vm) => {
    if (callback) {
      try { vm.invokeByName('run', '()V', callback, []); } catch (_) { /* ignore */ }
    }
  },
  'enableSlowWholeDocumentDraw()V': () => undefined,
};

const WEB_SETTINGS_METHODS = {
  'getJavaScriptEnabled()Z': (self) => !!self.$peer?.javaScriptEnabled,
  'getDomStorageEnabled()Z': (self) => !!self.$peer?.domStorageEnabled,
  'getDatabaseEnabled()Z': (self) => !!self.$peer?.databaseEnabled,
  'getUseWideViewPort()Z': (self) => !!self.$peer?.useWideViewPort,
  'getLoadWithOverviewMode()Z': (self) => !!self.$peer?.loadWithOverviewMode,
  'supportZoom()Z': (self) => (self.$peer?.supportZoom === undefined ? true : !!self.$peer.supportZoom),
  'getBuiltInZoomControls()Z': (self) => !!self.$peer?.builtInZoomControls,
  'getDisplayZoomControls()Z': (self) => (self.$peer?.displayZoomControls === undefined ? true : !!self.$peer.displayZoomControls),
  'getAllowFileAccess()Z': (self) => (self.$peer?.allowFileAccess === undefined ? true : !!self.$peer.allowFileAccess),
  'setAllowFileAccess(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.allowFileAccess = !!value;
  },
  'getAllowContentAccess()Z': (self) => (self.$peer?.allowContentAccess === undefined ? true : !!self.$peer.allowContentAccess),
  'setAllowContentAccess(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.allowContentAccess = !!value;
  },
  'getAllowFileAccessFromFileURLs()Z': (self) => !!self.$peer?.allowFileAccessFromFileURLs,
  'getAllowUniversalAccessFromFileURLs()Z': (self) => !!self.$peer?.allowUniversalAccessFromFileURLs,
  'getJavaScriptCanOpenWindowsAutomatically()Z': (self) => !!self.$peer?.javaScriptCanOpenWindowsAutomatically,
  'getLoadsImagesAutomatically()Z': (self) => (self.$peer?.loadsImagesAutomatically === undefined ? true : !!self.$peer.loadsImagesAutomatically),
  'getMediaPlaybackRequiresUserGesture()Z': (self) => (self.$peer?.mediaPlaybackRequiresUserGesture === undefined ? true : !!self.$peer.mediaPlaybackRequiresUserGesture),
  'getMixedContentMode()I': (self) => self.$peer?.mixedContentMode | 0,
  'getCacheMode()I': (self) => (self.$peer?.cacheMode === undefined ? -1 : self.$peer.cacheMode | 0),
  'getTextZoom()I': (self) => (self.$peer?.textZoom === undefined ? 100 : self.$peer.textZoom | 0),
  'getBlockNetworkImage()Z': (self) => !!self.$peer?.blockNetworkImage,
  'setBlockNetworkImage(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.blockNetworkImage = !!value;
  },
  'getBlockNetworkLoads()Z': (self) => (self.$peer?.blockNetworkLoads === undefined ? true : !!self.$peer.blockNetworkLoads),
  'setBlockNetworkLoads(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.blockNetworkLoads = !!value;
  },
  'getGeolocationEnabled()Z': (self) => !!self.$peer?.geolocationEnabled,
  'setGeolocationEnabled(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.geolocationEnabled = !!value;
  },
  'getLayoutAlgorithm()I': (self) => self.$peer?.layoutAlgorithm | 0,
  'setLayoutAlgorithm(I)V': (self, [value]) => {
    if (self.$peer) self.$peer.layoutAlgorithm = value | 0;
  },
  'getMinimumFontSize()I': (self) => (self.$peer?.minimumFontSize === undefined ? 8 : self.$peer.minimumFontSize | 0),
  'setMinimumFontSize(I)V': (self, [value]) => {
    if (self.$peer) self.$peer.minimumFontSize = value | 0;
  },
  'getMinimumLogicalFontSize()I': (self) => (self.$peer?.minimumLogicalFontSize === undefined ? 8 : self.$peer.minimumLogicalFontSize | 0),
  'setMinimumLogicalFontSize(I)V': (self, [value]) => {
    if (self.$peer) self.$peer.minimumLogicalFontSize = value | 0;
  },
  'getDefaultFontSize()I': (self) => (self.$peer?.defaultFontSize === undefined ? 16 : self.$peer.defaultFontSize | 0),
  'getDefaultFixedFontSize()I': (self) => (self.$peer?.defaultFixedFontSize === undefined ? 16 : self.$peer.defaultFixedFontSize | 0),
  'setDefaultFixedFontSize(I)V': (self, [value]) => {
    if (self.$peer) self.$peer.defaultFixedFontSize = value | 0;
  },
  'getDefaultTextEncodingName()Ljava/lang/String;': (self) => self.$peer?.defaultTextEncodingName ?? 'UTF-8',
  'setDefaultTextEncodingName(Ljava/lang/String;)V': (self, [value]) => {
    if (self.$peer) self.$peer.defaultTextEncodingName = String(value ?? '');
  },
  'setStandardFontFamily(Ljava/lang/String;)V': (self, [value]) => {
    if (self.$peer) self.$peer.standardFontFamily = String(value ?? '');
  },
  'setFixedFontFamily(Ljava/lang/String;)V': (self, [value]) => {
    if (self.$peer) self.$peer.fixedFontFamily = String(value ?? '');
  },
  'setSansSerifFontFamily(Ljava/lang/String;)V': (self, [value]) => {
    if (self.$peer) self.$peer.sansSerifFontFamily = String(value ?? '');
  },
  'setSerifFontFamily(Ljava/lang/String;)V': (self, [value]) => {
    if (self.$peer) self.$peer.serifFontFamily = String(value ?? '');
  },
  'setCursiveFontFamily(Ljava/lang/String;)V': (self, [value]) => {
    if (self.$peer) self.$peer.cursiveFontFamily = String(value ?? '');
  },
  'setFantasyFontFamily(Ljava/lang/String;)V': (self, [value]) => {
    if (self.$peer) self.$peer.fantasyFontFamily = String(value ?? '');
  },
  'getStandardFontFamily()Ljava/lang/String;': (self) => self.$peer?.standardFontFamily ?? 'sans-serif',
  'setOffscreenPreRaster(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.offscreenPreRaster = !!value;
  },
  'getOffscreenPreRaster()Z': (self) => !!self.$peer?.offscreenPreRaster,
  'setForceDark(I)V': (self, [value]) => {
    if (self.$peer) self.$peer.forceDark = value | 0;
  },
  'getForceDark()I': (self) => self.$peer?.forceDark | 0,
  'setAlgorithmicDarkeningAllowed(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.algorithmicDarkeningAllowed = !!value;
  },
  'getAlgorithmicDarkeningAllowed()Z': (self) => !!self.$peer?.algorithmicDarkeningAllowed,
  'setNeedInitialFocus(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.needInitialFocus = !!value;
  },
  'setRenderPriority(I)V': (self, [value]) => {
    if (self.$peer) self.$peer.renderPriority = value | 0;
  },
  'setPluginState(I)V': () => undefined,
  'setPluginPath(Ljava/lang/String;)V': () => undefined,
  'getPluginState()I': () => 0,
  'supportMultipleWindows()Z': (self) => !!self.$peer?.supportMultipleWindows,
  'setSupportMultipleWindows(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.supportMultipleWindows = !!value;
  },
  'getTextSize()I': (self) => self.$peer?.textSize | 0,
  'getSaveFormData()Z': (self) => (self.$peer?.saveFormData === undefined ? true : !!self.$peer.saveFormData),
  'getSavePassword()Z': (self) => !!self.$peer?.savePassword,
  'getUserAgentString()Ljava/lang/String;': (self) => self.$peer?.userAgentString ?? '',
  'setFontDisplay(I)V': () => undefined,
  'getSafeBrowsingEnabled()Z': (self) => (self.$peer?.safeBrowsingEnabled === undefined ? true : !!self.$peer.safeBrowsingEnabled),
  'setSafeBrowsingEnabled(Z)V': (self, [value]) => {
    if (self.$peer) self.$peer.safeBrowsingEnabled = !!value;
  },
  'enableSmoothTransition()Z': () => false,
  'setDatabasePath(Ljava/lang/String;)V': () => undefined,
  'setGeolocationDatabasePath(Ljava/lang/String;)V': () => undefined,
  'setAppCacheMaxSize(J)V': () => undefined,
  'setAppCachePath(Ljava/lang/String;)V': () => undefined,
};

const WEBVIEW_CLIENT_METHODS = {
  'onLoadResource(Landroid/webkit/WebView;Ljava/lang/String;)V': () => undefined,
  'shouldInterceptRequest(Landroid/webkit/WebView;Ljava/lang/String;)Landroid/webkit/WebResourceResponse;': () => null,
  'shouldInterceptRequest(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;': () => null,
  'onReceivedHttpError(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;Landroid/webkit/WebResourceResponse;)V': () => undefined,
  'onReceivedError(Landroid/webkit/WebView;ILjava/lang/String;Ljava/lang/String;)V': () => undefined,
  'onReceivedError(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;Landroid/webkit/WebResourceError;)V': () => undefined,
  'onReceivedSslError(Landroid/webkit/WebView;Landroid/webkit/SslErrorHandler;Landroid/net/http/SslError;)V': () => undefined,
  'onFormResubmission(Landroid/webkit/WebView;Landroid/os/Message;Landroid/os/Message;)V': () => undefined,
  'doUpdateVisitedHistory(Landroid/webkit/WebView;Ljava/lang/String;Z)V': () => undefined,
  'onScaleChanged(Landroid/webkit/WebView;FF)V': () => undefined,
  'onReceivedClientCertRequest(Landroid/webkit/WebView;Landroid/webkit/ClientCertRequest;)V': () => undefined,
  'onReceivedHttpAuthRequest(Landroid/webkit/WebView;Landroid/webkit/HttpAuthHandler;Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
  'onTooManyRedirects(Landroid/webkit/WebView;Landroid/os/Message;Landroid/os/Message;)V': () => undefined,
  'onReceivedLoginRequest(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
  'shouldOverrideKeyEvent(Landroid/webkit/WebView;Landroid/view/KeyEvent;)Z': () => false,
  'onUnhandledKeyEvent(Landroid/webkit/WebView;Landroid/view/KeyEvent;)V': () => undefined,
  'onSafeBrowsingHit(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;ILandroid/webkit/SafeBrowsingResponse;)V': () => undefined,
};

const WEB_CHROME_CLIENT_METHODS = {
  'onConsoleMessage(Landroid/webkit/ConsoleMessage;)Z': () => false,
  'onConsoleMessage(Ljava/lang/String;ILjava/lang/String;)V': () => undefined,
  'onShowFileChooser(Landroid/webkit/WebView;Landroid/webkit/ValueCallback;Landroid/webkit/WebChromeClient$FileChooserParams;)Z': () => false,
  'onPermissionRequest(Landroid/webkit/PermissionRequest;)V': () => undefined,
  'onPermissionRequestCanceled(Landroid/webkit/PermissionRequest;)V': () => undefined,
  'onCreateWindow(Landroid/webkit/WebView;ZZLandroid/os/Message;)Z': () => false,
  'onCloseWindow(Landroid/webkit/WebView;)V': () => undefined,
  'onRequestFocus(Landroid/webkit/WebView;)V': () => undefined,
  'onJsPrompt(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Landroid/webkit/JsPromptResult;)Z': () => false,
  'onJsBeforeUnload(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Landroid/webkit/JsResult;)Z': () => false,
  'onReceivedIcon(Landroid/webkit/WebView;Landroid/graphics/Bitmap;)V': () => undefined,
  'onReceivedTouchIconUrl(Landroid/webkit/WebView;Ljava/lang/String;Z)V': () => undefined,
  'onShowCustomView(Landroid/view/View;ILandroid/webkit/WebChromeClient$CustomViewCallback;)V': () => undefined,
  'onShowCustomView(Landroid/view/View;Landroid/webkit/WebChromeClient$CustomViewCallback;)V': () => undefined,
  'onHideCustomView()V': () => undefined,
  'onGeolocationPermissionsShowPrompt(Ljava/lang/String;Landroid/webkit/GeolocationPermissions$Callback;)V': () => undefined,
  'onGeolocationPermissionsHidePrompt()V': () => undefined,
  'getDefaultVideoPoster()Landroid/graphics/Bitmap;': () => null,
  'getVideoLoadingProgressView()Landroid/view/View;': () => null,
  'onProgressChanged(Landroid/webkit/WebView;I)V': () => undefined,
  'onReceivedTitle(Landroid/webkit/WebView;Ljava/lang/String;)V': () => undefined,
};

const COMPAT = {
  'Landroid/view/View;': { instance: VIEW_METHODS },
  'Landroid/view/ViewGroup;': { instance: VIEW_GROUP_METHODS },
  'Landroid/widget/TextView;': { instance: TEXT_VIEW_METHODS },
  'Landroid/graphics/Canvas;': { instance: CANVAS_METHODS },
  'Landroid/graphics/Paint;': { instance: PAINT_METHODS },
  'Landroid/graphics/Bitmap;': { instance: BITMAP_METHODS, static: BITMAP_STATIC_METHODS },
  'Landroid/view/MotionEvent;': { instance: MOTION_EVENT_METHODS, static: MOTION_EVENT_STATIC_METHODS },
  'Landroid/content/Intent;': { instance: INTENT_METHODS },
  'Landroid/app/Dialog;': { instance: DIALOG_METHODS },
  'Landroid/webkit/WebView;': { instance: WEBVIEW_METHODS, static: WEBVIEW_STATIC_METHODS },
  'Landroid/webkit/WebSettings;': { instance: WEB_SETTINGS_METHODS },
  'Landroid/webkit/WebViewClient;': { instance: WEBVIEW_CLIENT_METHODS },
  'Landroid/webkit/WebChromeClient;': { instance: WEB_CHROME_CLIENT_METHODS },
};

export function applyCompatMethods(defs) {
  for (const def of defs) {
    const group = COMPAT[def.descriptor];
    if (!group) continue;
    for (const [key, impl] of Object.entries(group.instance || {})) {
      if (!def.methods.has(key)) def.methods.set(key, impl);
    }
    for (const [key, impl] of Object.entries(group.static || {})) {
      if (!def.staticMethods.has(key)) def.staticMethods.set(key, impl);
    }
  }
  return defs;
}
