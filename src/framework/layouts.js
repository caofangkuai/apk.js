import {
  HORIZONTAL,
  MeasureSpec,
  VERTICAL,
  VISIBILITY,
  View,
  ViewGroup,
  colorToCss,
  getChildMeasureSpec,
  isGone,
} from './view.js';

export class FrameLayout extends ViewGroup {
  constructor(context = null) {
    super(context);
    this.foregroundGravity = 0x11;
    this.measureAllChildren = false;
  }

  generateDefaultLayoutParams() {
    return { width: -1, height: -1, gravity: -1, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
  }

  onMeasure(widthSpec, heightSpec) {
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    let maxWidth = 0;
    let maxHeight = 0;
    const count = this.children.length;
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child) && !this.measureAllChildren) continue;
      const params = child.layoutParams || this.generateDefaultLayoutParams();
      const lp = child.layoutParams || params;
      let childWidthSpec;
      let childHeightSpec;
      const margins = (lp.leftMargin || 0) + (lp.rightMargin || 0);
      const marginsV = (lp.topMargin || 0) + (lp.bottomMargin || 0);
      if (widthMode === MeasureSpec.UNSPECIFIED) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight + margins, lp.width);
      }
      if (heightMode === MeasureSpec.UNSPECIFIED) {
        childHeightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childHeightSpec = getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom + marginsV, lp.height);
      }
      child.measure(childWidthSpec, childHeightSpec);
      maxWidth = Math.max(maxWidth, child.getMeasuredWidth() + margins);
      maxHeight = Math.max(maxHeight, child.getMeasuredHeight() + marginsV);
    }
    maxWidth += this.paddingLeft + this.paddingRight;
    maxHeight += this.paddingTop + this.paddingBottom;
    maxWidth = Math.max(maxWidth, this.minWidth);
    maxHeight = Math.max(maxHeight, this.minHeight);
    this.setMeasuredDimension(
      resolveSizeSafe(maxWidth, widthSpec),
      resolveSizeSafe(maxHeight, heightSpec)
    );
  }

  onLayout(changed, left, top, right, bottom) {
    const parentLeft = this.paddingLeft;
    const parentTop = this.paddingTop;
    const parentRight = right - left - this.paddingRight;
    const parentBottom = bottom - top - this.paddingBottom;
    const count = this.children.length;
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const width = child.getMeasuredWidth();
      const height = child.getMeasuredHeight();
      let gravity = (lp.gravity ?? -1) === -1 ? 0x03 : lp.gravity;
      let x = parentLeft + (lp.leftMargin || 0);
      let y = parentTop + (lp.topMargin || 0);
      if ((gravity & 0x01) === 0x01) {
        x = parentLeft + Math.floor((parentRight - parentLeft - width) / 2) + (lp.leftMargin || 0) - (lp.rightMargin || 0);
      } else if ((gravity & 0x05) === 0x05) {
        x = parentRight - width - (lp.rightMargin || 0);
      }
      if ((gravity & 0x10) === 0x10) {
        y = parentTop + Math.floor((parentBottom - parentTop - height) / 2) + (lp.topMargin || 0) - (lp.bottomMargin || 0);
      } else if ((gravity & 0x50) === 0x50) {
        y = parentBottom - height - (lp.bottomMargin || 0);
      }
      child.layout(x, y, x + width, y + height);
    }
  }
}

export class LinearLayout extends ViewGroup {
  constructor(context = null) {
    super(context);
    this.orientation = HORIZONTAL;
    this.gravity = 0x800003;
    this.baselineAligned = true;
    this.showDividers = 0;
    this.dividerDrawable = null;
    this.weightSum = 0;
  }

  generateDefaultLayoutParams() {
    return {
      width: this.orientation === VERTICAL ? -1 : -2,
      height: this.orientation === VERTICAL ? -2 : -1,
      weight: 0,
      gravity: -1,
      leftMargin: 0,
      topMargin: 0,
      rightMargin: 0,
      bottomMargin: 0,
    };
  }

  setOrientation(orientation) {
    this.orientation = orientation;
    this.requestLayout();
    return this;
  }

  getOrientation() {
    return this.orientation;
  }

  setGravity(gravity) {
    this.gravity = gravity;
    this.requestLayout();
    return this;
  }

  setWeightSum(sum) {
    this.weightSum = sum;
    return this;
  }

  setShowDividers(mode) {
    this.showDividers = mode;
    return this;
  }

  setDividerDrawable(drawable) {
    this.dividerDrawable = drawable;
    return this;
  }

  onMeasure(widthSpec, heightSpec) {
    if (this.orientation === VERTICAL) this.measureVertical(widthSpec, heightSpec);
    else this.measureHorizontal(widthSpec, heightSpec);
  }

  measureVertical(widthSpec, heightSpec) {
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    let totalHeight = 0;
    let maxWidth = 0;
    let totalWeight = 0;
    const count = this.children.length;
    const measured = new Array(count).fill(null);

    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const weight = lp.weight || 0;
      totalWeight += weight;
      const marginsV = (lp.topMargin || 0) + (lp.bottomMargin || 0);
      const marginsH = (lp.leftMargin || 0) + (lp.rightMargin || 0);
      let childWidthSpec;
      if (widthMode === MeasureSpec.UNSPECIFIED) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight + marginsH, lp.width);
      }
      let childHeightSpec;
      if (heightMode === MeasureSpec.UNSPECIFIED) {
        childHeightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childHeightSpec = getChildMeasureSpec(
          heightSpec,
          this.paddingTop + this.paddingBottom + marginsV,
          lp.height
        );
      }
      child.measure(childWidthSpec, childHeightSpec);
      measured[i] = { child, lp, marginsV, marginsH, weight };
      totalHeight += child.getMeasuredHeight() + marginsV;
      maxWidth = Math.max(maxWidth, child.getMeasuredWidth() + marginsH);
    }

    totalHeight += this.paddingTop + this.paddingBottom;
    maxWidth += this.paddingLeft + this.paddingRight;

    const heightSize = MeasureSpec.getSize(heightSpec);
    const remaining = heightMode === MeasureSpec.EXACTLY || heightMode === MeasureSpec.AT_MOST
      ? Math.max(0, heightSize - totalHeight)
      : 0;

    if (remaining > 0 && totalWeight > 0) {
      totalHeight = this.paddingTop + this.paddingBottom;
      for (let i = 0; i < count; i++) {
        const entry = measured[i];
        if (!entry) continue;
        const child = entry.child;
        const share = entry.weight > 0 ? Math.floor((remaining * entry.weight) / totalWeight) : 0;
        const height = child.getMeasuredHeight() + share;
        child.measure(
          MeasureSpec.makeMeasureSpec(child.getMeasuredWidth(), MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
        );
        totalHeight += height + entry.marginsV;
        maxWidth = Math.max(maxWidth, child.getMeasuredWidth() + entry.marginsH);
      }
    }

    this.totalLength = totalHeight;
    maxWidth = Math.max(maxWidth, this.minWidth);
    totalHeight = Math.max(totalHeight, this.minHeight);
    this.setMeasuredDimension(resolveSizeSafe(maxWidth, widthSpec), resolveSizeSafe(totalHeight, heightSpec));
  }

  measureHorizontal(widthSpec, heightSpec) {
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    let totalWidth = 0;
    let maxHeight = 0;
    let totalWeight = 0;
    const count = this.children.length;
    const measured = new Array(count).fill(null);

    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const weight = lp.weight || 0;
      totalWeight += weight;
      const marginsH = (lp.leftMargin || 0) + (lp.rightMargin || 0);
      const marginsV = (lp.topMargin || 0) + (lp.bottomMargin || 0);
      let childHeightSpec;
      if (heightMode === MeasureSpec.UNSPECIFIED) {
        childHeightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childHeightSpec = getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom + marginsV, lp.height);
      }
      let childWidthSpec;
      if (widthMode === MeasureSpec.UNSPECIFIED) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight + marginsH, lp.width);
      }
      child.measure(childWidthSpec, childHeightSpec);
      measured[i] = { child, lp, marginsV, marginsH, weight };
      totalWidth += child.getMeasuredWidth() + marginsH;
      maxHeight = Math.max(maxHeight, child.getMeasuredHeight() + marginsV);
    }

    totalWidth += this.paddingLeft + this.paddingRight;
    maxHeight += this.paddingTop + this.paddingBottom;

    const widthSize = MeasureSpec.getSize(widthSpec);
    const remaining = widthMode === MeasureSpec.EXACTLY || widthMode === MeasureSpec.AT_MOST
      ? Math.max(0, widthSize - totalWidth)
      : 0;

    if (remaining > 0 && totalWeight > 0) {
      totalWidth = this.paddingLeft + this.paddingRight;
      for (let i = 0; i < count; i++) {
        const entry = measured[i];
        if (!entry) continue;
        const child = entry.child;
        const share = entry.weight > 0 ? Math.floor((remaining * entry.weight) / totalWeight) : 0;
        const width = child.getMeasuredWidth() + share;
        child.measure(
          MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(child.getMeasuredHeight(), MeasureSpec.EXACTLY)
        );
        totalWidth += width + entry.marginsH;
        maxHeight = Math.max(maxHeight, child.getMeasuredHeight() + entry.marginsV);
      }
    }

    this.totalLength = totalWidth;
    maxHeight = Math.max(maxHeight, this.minHeight);
    totalWidth = Math.max(totalWidth, this.minWidth);
    this.setMeasuredDimension(resolveSizeSafe(totalWidth, widthSpec), resolveSizeSafe(maxHeight, heightSpec));
  }

  onLayout(changed, left, top, right, bottom) {
    if (this.orientation === VERTICAL) this.layoutVertical(left, top, right, bottom);
    else this.layoutHorizontal(left, top, right, bottom);
  }

  layoutVertical(left, top, right, bottom) {
    const width = right - left;
    const height = bottom - top;
    let childTop = this.paddingTop;
    const count = this.children.length;

    let contentHeight = 0;
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      contentHeight += (lp.topMargin || 0) + child.getMeasuredHeight() + (lp.bottomMargin || 0);
    }
    const available = height - this.paddingTop - this.paddingBottom;
    const verticalGravity = this.gravity & 0x70;
    if ((verticalGravity & 0x10) === 0x10) {
      childTop = this.paddingTop + Math.floor(Math.max(0, available - contentHeight) / 2);
    } else if ((verticalGravity & 0x50) === 0x50) {
      childTop = this.paddingTop + Math.max(0, available - contentHeight);
    }

    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const childWidth = child.getMeasuredWidth();
      const childHeight = child.getMeasuredHeight();
      let childLeft = this.paddingLeft + (lp.leftMargin || 0);
      const gravity = resolveGravity(this.gravity, lp.gravity);
      if ((gravity & 0x07) === 0x01) {
        childLeft = this.paddingLeft + Math.floor((width - this.paddingLeft - this.paddingRight - childWidth) / 2) + (lp.leftMargin || 0) - (lp.rightMargin || 0);
      } else if ((gravity & 0x07) === 0x05) {
        childLeft = width - this.paddingRight - childWidth - (lp.rightMargin || 0);
      }
      childTop += (lp.topMargin || 0);
      child.layout(childLeft, childTop, childLeft + childWidth, childTop + childHeight);
      childTop += childHeight + (lp.bottomMargin || 0);
    }
  }

  layoutHorizontal(left, top, right, bottom) {
    const width = right - left;
    const height = bottom - top;
    let childLeft = this.paddingLeft;
    const count = this.children.length;
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const childWidth = child.getMeasuredWidth();
      const childHeight = child.getMeasuredHeight();
      let childTop = this.paddingTop + (lp.topMargin || 0);
      const gravity = resolveGravity(this.gravity, lp.gravity);
      if ((gravity & 0x70) === 0x10) {
        childTop = this.paddingTop + Math.floor((height - this.paddingTop - this.paddingBottom - childHeight) / 2) + (lp.topMargin || 0) - (lp.bottomMargin || 0);
      } else if ((gravity & 0x70) === 0x50) {
        childTop = height - this.paddingBottom - childHeight - (lp.bottomMargin || 0);
      }
      childLeft += (lp.leftMargin || 0);
      child.layout(childLeft, childTop, childLeft + childWidth, childTop + childHeight);
      childLeft += childWidth + (lp.rightMargin || 0);
    }
  }
}

export class RelativeLayout extends ViewGroup {
  generateDefaultLayoutParams() {
    return { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
  }

  onMeasure(widthSpec, heightSpec) {
    let maxWidth = 0;
    let maxHeight = 0;
    for (const child of this.children) {
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const marginsH = (lp.leftMargin || 0) + (lp.rightMargin || 0);
      const marginsV = (lp.topMargin || 0) + (lp.bottomMargin || 0);
      child.measure(
        getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight + marginsH, lp.width),
        getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom + marginsV, lp.height)
      );
    }
    const probeWidth = Math.max(
      MeasureSpec.getMode(widthSpec) === MeasureSpec.UNSPECIFIED
        ? 0
        : MeasureSpec.getSize(widthSpec),
      0
    );
    const probeHeight = Math.max(
      MeasureSpec.getMode(heightSpec) === MeasureSpec.UNSPECIFIED
        ? 0
        : MeasureSpec.getSize(heightSpec),
      0
    );
    const bounds = this.measureRelativeBounds(probeWidth, probeHeight);
    maxWidth = bounds.width;
    maxHeight = bounds.height;
    this.setMeasuredDimension(
      resolveSizeSafe(maxWidth + this.paddingLeft + this.paddingRight, widthSpec),
      resolveSizeSafe(maxHeight + this.paddingTop + this.paddingBottom, heightSpec)
    );
  }

  measureRelativeBounds(availableWidth, availableHeight) {
    const placed = new Map();
    const all = [];
    const collect = (node) => {
      for (const child of node.children || []) {
        all.push(child);
        collect(child);
      }
    };
    collect(this);
    let maxRight = 0;
    let maxBottom = 0;
    const place = (child, x, y, w, h) => {
      placed.set(child.id >>> 0, { left: x, top: y, width: w, height: h });
      maxRight = Math.max(maxRight, x + w);
      maxBottom = Math.max(maxBottom, y + h);
    };
    const lookup = (id) => {
      const target = id >>> 0;
      for (const view of all) if ((view.id >>> 0) === target) return view;
      return null;
    };
    const width = Math.max(availableWidth, 0);
    const height = Math.max(availableHeight, 0);
    let remaining = this.children.filter((c) => !isGone(c));
    let guard = 0;
    while (remaining.length && guard++ < 16) {
      const deferred = [];
      for (const child of remaining) {
        const lp = child.layoutParams || this.generateDefaultLayoutParams();
        const rules = (lp && lp.rules) || {};
        const cw = child.getMeasuredWidth();
        const ch = child.getMeasuredHeight();
        const ml = lp.leftMargin || 0;
        const mt = lp.topMargin || 0;
        const mr = lp.rightMargin || 0;
        const mb = lp.bottomMargin || 0;
        let x = this.paddingLeft + ml;
        let y = this.paddingTop + mt;
        let ready = true;
        const relTo = (key) => {
          const id = rules[key];
          if (id === undefined || id === null) return null;
          if (!placed.has(id >>> 0)) return undefined;
          return placed.get(id >>> 0);
        };
        if (rules.alignParentRight) x = width - this.paddingRight - cw - mr;
        if (rules.centerInParent || rules.centerHorizontal) {
          x = this.paddingLeft + Math.floor((width - this.paddingLeft - this.paddingRight - cw - ml - mr) / 2) + ml;
        }
        if (rules.alignParentBottom && height > 0) y = height - this.paddingBottom - ch - mb;
        if (rules.centerInParent || rules.centerVertical) {
          y = this.paddingTop + Math.floor((height - this.paddingTop - this.paddingBottom - ch - mt - mb) / 2) + mt;
        }
        for (const [key, apply] of [
          ['below', (b) => { y = b.top + b.height + mt; }],
          ['above', (b) => { y = b.top - ch - mb; }],
          ['toRightOf', (b) => { x = b.left + b.width + ml; }],
          ['toLeftOf', (b) => { x = b.left - cw - mr; }],
          ['alignTop', (b) => { y = b.top + mt; }],
          ['alignBottom', (b) => { y = b.top + b.height - ch - mb; }],
          ['alignLeft', (b) => { x = b.left + ml; }],
          ['alignRight', (b) => { x = b.left + b.width - cw - mr; }],
        ]) {
          if (rules[key] === undefined || rules[key] === null) continue;
          const b = relTo(key);
          if (b === undefined) ready = false;
          else if (b) apply(b);
        }
        if (!ready) { deferred.push(child); continue; }
        place(child, x, y, cw, ch);
      }
      if (deferred.length === remaining.length) {
        for (const child of deferred) {
          const lp = child.layoutParams || this.generateDefaultLayoutParams();
          place(child, this.paddingLeft + (lp.leftMargin || 0), this.paddingTop + (lp.topMargin || 0), child.getMeasuredWidth(), child.getMeasuredHeight());
        }
        break;
      }
      remaining = deferred;
    }
    return { width: maxRight, height: maxBottom };
  }

  onLayout(changed, left, top, right, bottom) {
    const width = right - left;
    const height = bottom - top;
    const placed = new Map();
    const all = [];
    const collect = (node) => {
      for (const child of node.children || []) {
        all.push(child);
        collect(child);
      }
    };
    collect(this);
    const lookup = (id) => {
      const target = id >>> 0;
      for (const view of all) if ((view.id >>> 0) === target) return view;
      return null;
    };
    const place = (child, x, y, w, h) => {
      placed.set(child.id >>> 0, { left: x, top: y, width: w, height: h });
      child.layout(x, y, x + w, y + h);
    };
    let remaining = this.children.filter((c) => !isGone(c));
    let guard = 0;
    while (remaining.length && guard++ < 16) {
      const deferred = [];
      for (const child of remaining) {
        const lp = child.layoutParams || this.generateDefaultLayoutParams();
        const rules = (lp && lp.rules) || {};
        const cw = child.getMeasuredWidth();
        const ch = child.getMeasuredHeight();
        const ml = lp.leftMargin || 0;
        const mt = lp.topMargin || 0;
        const mr = lp.rightMargin || 0;
        const mb = lp.bottomMargin || 0;
        let x = this.paddingLeft + ml;
        let y = this.paddingTop + mt;
        let ready = true;
        const relTo = (key) => {
          const id = rules[key];
          if (id === undefined || id === null) return null;
          if (!placed.has(id >>> 0)) return undefined;
          return placed.get(id >>> 0);
        };
        if (rules.alignParentRight) x = width - this.paddingRight - cw - mr;
        if (rules.centerInParent || rules.centerHorizontal) {
          x = this.paddingLeft + Math.floor((width - this.paddingLeft - this.paddingRight - cw - ml - mr) / 2) + ml;
        }
        if (rules.alignParentBottom) y = height - this.paddingBottom - ch - mb;
        if (rules.centerInParent || rules.centerVertical) {
          y = this.paddingTop + Math.floor((height - this.paddingTop - this.paddingBottom - ch - mt - mb) / 2) + mt;
        }
        for (const [key, apply] of [
          ['below', (b) => { y = b.top + b.height + mt; }],
          ['above', (b) => { y = b.top - ch - mb; }],
          ['toRightOf', (b) => { x = b.left + b.width + ml; }],
          ['toLeftOf', (b) => { x = b.left - cw - mr; }],
          ['alignTop', (b) => { y = b.top + mt; }],
          ['alignBottom', (b) => { y = b.top + b.height - ch - mb; }],
          ['alignLeft', (b) => { x = b.left + ml; }],
          ['alignRight', (b) => { x = b.left + b.width - cw - mr; }],
        ]) {
          if (rules[key] === undefined || rules[key] === null) continue;
          const b = relTo(key);
          if (b === undefined) ready = false;
          else if (b) apply(b);
        }
        if (!ready) { deferred.push(child); continue; }
        place(child, x, y, cw, ch);
      }
      if (deferred.length === remaining.length) {
        for (const child of deferred) {
          const lp = child.layoutParams || this.generateDefaultLayoutParams();
          place(child, this.paddingLeft + (lp.leftMargin || 0), this.paddingTop + (lp.topMargin || 0), child.getMeasuredWidth(), child.getMeasuredHeight());
        }
        break;
      }
      remaining = deferred;
    }
  }
}

function presentedLayout(child, x, y, width, height, placed) {
  child.layout(x, y, x + width, y + height);
  placed.set(child.id >>> 0, { left: x, top: y, width, height });
}

export function resolveSizeSafe(size, spec) {
  const mode = MeasureSpec.getMode(spec);
  const specSize = MeasureSpec.getSize(spec);
  if (mode === MeasureSpec.AT_MOST) return Math.min(size, specSize);
  if (mode === MeasureSpec.EXACTLY) return specSize;
  return size;
}

export function resolveGravity(parentGravity, childGravity) {
  return childGravity === undefined || childGravity === null || childGravity === -1 ? parentGravity : childGravity;
}

function actionBarHeightOf(view) {
  const vm = view?.$vm;
  const theme = vm?.themeAttributes;
  const size = theme?.actionBarSize;
  if (typeof size === 'number' && size > 0x01000000) {
    const resolved = vm?.resources?.table?.resolve(size);
    if (typeof resolved === 'number' && resolved > 0) return Math.round(resolved);
    if (resolved && typeof resolved === 'object' && resolved.dimension) {
      const density = vm?.displayMetrics?.density || vm?.resources?.density || 1;
      return Math.round(resolved.dimension * density);
    }
    return 56;
  }
  if (typeof size === 'number' && size > 0) return Math.round(size);
  return 56;
}

function actionBarColorOf(view) {
  const theme = view?.$vm?.themeAttributes;
  const color = theme?.colorPrimary;
  return typeof color === 'number' ? color >>> 0 : 0xff3f51b5;
}

export class ActionBarContainer extends FrameLayout {
  onMeasure(widthSpec, heightSpec) {
    const width = MeasureSpec.getSize(widthSpec);
    const height = actionBarHeightOf(this);
    let contentHeight = 0;
    for (const child of this.children) {
      if (isGone(child)) continue;
      child.measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.AT_MOST)
      );
      contentHeight = Math.max(contentHeight, child.getMeasuredHeight());
    }
    this.setMeasuredDimension(
      resolveSizeSafe(width, widthSpec),
      resolveSizeSafe(contentHeight > 0 ? Math.min(contentHeight, height) : height, heightSpec)
    );
  }

  onLayout(changed, left, top, right, bottom) {
    const width = right - left;
    const height = bottom - top;
    for (const child of this.children) {
      if (isGone(child)) continue;
      child.layout(0, 0, width, child.getMeasuredHeight() || height);
    }
  }

  draw(canvas) {
    if (this.background == null) this.background = { type: 'color', color: actionBarColorOf(this) };
    super.draw(canvas);
  }
}

export class ActionBarOverlayLayout extends FrameLayout {
  onMeasure(widthSpec, heightSpec) {
    const width = MeasureSpec.getSize(widthSpec);
    const height = MeasureSpec.getSize(heightSpec);
    let barHeight = 0;
    for (const child of this.children) {
      const isBar = !!child.id && (child.id >>> 0) === 0x7f070029;
      if (isBar) {
        child.measure(
          MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(actionBarHeightOf(this), MeasureSpec.EXACTLY)
        );
        barHeight = child.getMeasuredHeight();
      } else {
        const contentHeight = Math.max(0, height - (this.$barHeight || actionBarHeightOf(this)));
        child.measure(
          MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(contentHeight, MeasureSpec.EXACTLY)
        );
      }
    }
    this.setMeasuredDimension(
      resolveSizeSafe(width, widthSpec),
      resolveSizeSafe(height, heightSpec)
    );
    this.$barHeight = barHeight;
  }

  onLayout(changed, left, top, right, bottom) {
    const width = right - left;
    const height = bottom - top;
    const barHeight = this.$barHeight || 0;
    for (const child of this.children) {
      if (isGone(child)) continue;
      const isBar = !!child.id && (child.id >>> 0) === 0x7f070029;
      if (isBar) {
        child.layout(0, 0, width, barHeight);
      } else {
        child.layout(0, barHeight, width, height);
      }
    }
  }
}

function toolbarTitleOf(view) {
  const vm = view?.$vm;
  if (vm?.toolbarTitle) return String(vm.toolbarTitle);
  const manifest = vm?.apk?.manifest;
  const app = manifest?.application || (manifest?.children || []).find((c) => c.name === 'application');
  const labelAttr = (app?.attrs || []).find((a) => a.name === 'label');
  if (labelAttr) {
    const value = labelAttr.value;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'reference' in value) {
      const resolved = vm?.resources?.table?.resolve(value.reference);
      if (typeof resolved === 'string') return resolved;
    }
  }
  return '';
}

export class Toolbar extends FrameLayout {
  onMeasure(widthSpec, heightSpec) {
    super.onMeasure(widthSpec, heightSpec);
    const height = this.getMeasuredHeight() || actionBarHeightOf(this);
    this.setMeasuredDimension(this.getMeasuredWidth(), height);
  }

  draw(canvas) {
    const ctx = canvas.context;
    const width = this.getWidth();
    const height = this.getHeight();
    if (ctx) {
      const theme = this.$vm?.themeAttributes;
      const color = theme?.colorPrimary;
      ctx.fillStyle = colorToCss(typeof color === 'number' ? color >>> 0 : 0xff3f51b5);
      ctx.fillRect(0, 0, width, height);
      const title = toolbarTitleOf(this);
      if (title) {
        const titleColor = theme?.titleTextColor;
        ctx.fillStyle = colorToCss(typeof titleColor === 'number' ? titleColor >>> 0 : 0xffffffff);
        const size = 20;
        ctx.font = `${size}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(title, 16, height / 2);
      }
    }
    super.draw(canvas);
  }
}

export class AbsoluteLayout extends ViewGroup {
  constructor(context = null) {
    super(context);
  }

  generateDefaultLayoutParams() {
    return { width: -2, height: -2, x: 0, y: 0 };
  }

  static resolveOffset(lp, axis) {
    if (!lp) return 0;
    const direct = lp[axis];
    if (typeof direct === 'number') return direct;
    if (lp.$layoutParams && typeof lp.$layoutParams[axis] === 'number') return lp.$layoutParams[axis];
    const field = lp.$fields?.get(`Landroid/widget/AbsoluteLayout$LayoutParams;->${axis}:I`);
    if (typeof field === 'number') return field;
    return 0;
  }

  onMeasure(widthSpec, heightSpec) {
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    let maxWidth = 0;
    let maxHeight = 0;
    const count = this.children.length;
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      let childWidthSpec;
      let childHeightSpec;
      if (widthMode === MeasureSpec.UNSPECIFIED) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight, lp.width);
      }
      if (heightMode === MeasureSpec.UNSPECIFIED) {
        childHeightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childHeightSpec = getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom, lp.height);
      }
      child.measure(childWidthSpec, childHeightSpec);
      const x = AbsoluteLayout.resolveOffset(lp, 'x');
      const y = AbsoluteLayout.resolveOffset(lp, 'y');
      maxWidth = Math.max(maxWidth, x + child.getMeasuredWidth());
      maxHeight = Math.max(maxHeight, y + child.getMeasuredHeight());
    }
    maxWidth += this.paddingLeft + this.paddingRight;
    maxHeight += this.paddingTop + this.paddingBottom;
    maxWidth = Math.max(maxWidth, this.minWidth);
    maxHeight = Math.max(maxHeight, this.minHeight);
    this.setMeasuredDimension(
      resolveSizeSafe(maxWidth, widthSpec),
      resolveSizeSafe(maxHeight, heightSpec)
    );
  }

  onLayout(changed, left, top, right, bottom) {
    const count = this.children.length;
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const x = this.paddingLeft + AbsoluteLayout.resolveOffset(lp, 'x');
      const y = this.paddingTop + AbsoluteLayout.resolveOffset(lp, 'y');
      const width = child.getMeasuredWidth();
      const height = child.getMeasuredHeight();
      child.layout(x, y, x + width, y + height);
    }
  }
}
