import { drawDrawable } from './drawables.js';
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
  resolveSize,
  toHostTouchEvent,
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
    const finalWidth = resolveSizeSafe(maxWidth, widthSpec);
    const finalHeight = resolveSizeSafe(maxHeight, heightSpec);
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child) && !this.measureAllChildren) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const marginsH = (lp.leftMargin || 0) + (lp.rightMargin || 0);
      const marginsV = (lp.topMargin || 0) + (lp.bottomMargin || 0);
      const needW = lp.width === -1;
      const needH = lp.height === -1;
      if (!needW && !needH) continue;
      const targetW = Math.max(0, finalWidth - this.paddingLeft - this.paddingRight - marginsH);
      const targetH = Math.max(0, finalHeight - this.paddingTop - this.paddingBottom - marginsV);
      child.measure(
        MeasureSpec.makeMeasureSpec(needW ? targetW : child.getMeasuredWidth(), needW ? MeasureSpec.EXACTLY : MeasureSpec.AT_MOST),
        MeasureSpec.makeMeasureSpec(needH ? targetH : child.getMeasuredHeight(), needH ? MeasureSpec.EXACTLY : MeasureSpec.AT_MOST)
      );
    }
    this.setMeasuredDimension(finalWidth, finalHeight);
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

export class HorizontalScrollView extends FrameLayout {
  constructor(context = null) {
    super(context);
    this.scrollX = 0;
    this.scrollY = 0;
    this.scrollRangeX = 0;
    this.fillViewport = false;
  }

  setFillViewport(value) {
    this.fillViewport = !!value;
    this.requestLayout();
  }

  getScrollX() {
    return this.scrollX;
  }

  getScrollY() {
    return this.scrollY;
  }

  onMeasure(widthSpec, heightSpec) {
    super.onMeasure(widthSpec, heightSpec);
  }

  onLayout(changed, left, top, right, bottom) {
    super.onLayout(changed, left, top, right, bottom);
    let maxRight = 0;
    for (const child of this.children) {
      if (child.visibility === 8) continue;
      maxRight = Math.max(maxRight, child.left + child.getWidth());
    }
    this.scrollRangeX = Math.max(0, maxRight - (right - left));
  }

  scrollTo(x, y) {
    this.scrollX = Math.max(0, Math.min(this.scrollRangeX, x));
    this.scrollY = y;
    this.invalidate();
  }

  dispatchDraw(canvas) {
    canvas.save();
    canvas.translate(-this.scrollX, -this.scrollY);
    super.dispatchDraw(canvas);
    canvas.restore();
  }
}

export class LinearLayout extends ViewGroup {
  constructor(context = null) {
    super(context);    this.orientation = HORIZONTAL;
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
      if (widthMode === MeasureSpec.EXACTLY && lp.width === 0 && weight > 0) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight + marginsH, lp.width);
      }
      const childHeightSpec = getChildMeasureSpec(
        heightSpec,
        this.paddingTop + this.paddingBottom + marginsV,
        lp.height
      );
      child.measure(childWidthSpec, childHeightSpec);
      measured[i] = { child, lp, marginsV, marginsH, weight };
      totalHeight += child.getMeasuredHeight() + marginsV;
      maxWidth = Math.max(maxWidth, child.getMeasuredWidth() + marginsH);
    }

    totalHeight += this.paddingTop + this.paddingBottom;
    maxWidth += this.paddingLeft + this.paddingRight;

    const heightSize = MeasureSpec.getSize(heightSpec);
    const remaining = heightMode === MeasureSpec.EXACTLY ? heightSize - totalHeight : 0;
    let remainingExcess = remaining;
    let remainingWeightSum = this.weightSum > 0 ? this.weightSum : totalWeight;

    if (remainingExcess !== 0 && totalWeight > 0) {
      totalHeight = this.paddingTop + this.paddingBottom;
      for (let i = 0; i < count; i++) {
        const entry = measured[i];
        if (!entry) continue;
        const child = entry.child;
        if (entry.weight <= 0) {
          totalHeight += child.getMeasuredHeight() + entry.marginsV;
          continue;
        }
        const share = Math.trunc((entry.weight * remainingExcess) / remainingWeightSum);
        remainingExcess -= share;
        remainingWeightSum -= entry.weight;
        const useShareOnly = entry.lp.height === 0 && heightMode === MeasureSpec.EXACTLY;
        const height = Math.max(0, (useShareOnly ? 0 : child.getMeasuredHeight()) + share);
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
      const childHeightSpec = getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom + marginsV, lp.height);
      let childWidthSpec;
      if (widthMode === MeasureSpec.EXACTLY && lp.width === 0 && weight > 0) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight + marginsH, lp.width);
      }
      child.measure(childWidthSpec, childHeightSpec);
      measured[i] = { child, lp, marginsV, marginsH, weight };
      if (lp.width === 0 && weight > 0) totalWidth += marginsH;
      else totalWidth += child.getMeasuredWidth() + marginsH;
      maxHeight = Math.max(maxHeight, child.getMeasuredHeight() + marginsV);
    }

    totalWidth += this.paddingLeft + this.paddingRight;
    maxHeight += this.paddingTop + this.paddingBottom;

    const widthSize = MeasureSpec.getSize(widthSpec);
    const remaining = widthMode === MeasureSpec.EXACTLY ? widthSize - totalWidth : 0;
    let remainingExcess = remaining;
    let remainingWeightSum = this.weightSum > 0 ? this.weightSum : totalWeight;

    if (remainingExcess !== 0 && totalWeight > 0) {
      totalWidth = this.paddingLeft + this.paddingRight;
      for (let i = 0; i < count; i++) {
        const entry = measured[i];
        if (!entry) continue;
        const child = entry.child;
        if (entry.weight <= 0) {
          totalWidth += child.getMeasuredWidth() + entry.marginsH;
          continue;
        }
        const share = Math.trunc((entry.weight * remainingExcess) / remainingWeightSum);
        remainingExcess -= share;
        remainingWeightSum -= entry.weight;
        const useShareOnly = entry.lp.width === 0 && widthMode === MeasureSpec.EXACTLY;
        const width = Math.max(0, (useShareOnly ? 0 : child.getMeasuredWidth()) + share);
        child.measure(
          MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(child.getMeasuredHeight(), MeasureSpec.EXACTLY)
        );
        totalWidth += width + entry.marginsH;
        maxHeight = Math.max(maxHeight, child.getMeasuredHeight() + entry.marginsV);
      }
    }

    const finalWidth = resolveSizeSafe(totalWidth, widthSpec);
    const finalHeight = resolveSizeSafe(maxHeight, heightSpec);
    if (heightMode !== MeasureSpec.UNSPECIFIED) {
      const innerHeight = Math.max(0, (heightMode === MeasureSpec.EXACTLY ? MeasureSpec.getSize(heightSpec) : finalHeight) - this.paddingTop - this.paddingBottom);
      for (const entry of measured) {
        if (!entry || entry.lp.height !== -1) continue;
        const targetHeight = Math.max(0, innerHeight - entry.marginsV);
        entry.child.measure(MeasureSpec.makeMeasureSpec(entry.child.getMeasuredWidth(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(targetHeight, MeasureSpec.EXACTLY));
      }
    }
    this.totalLength = finalWidth;
    maxHeight = Math.max(maxHeight, this.minHeight);
    totalWidth = Math.max(finalWidth, this.minWidth);
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
    let maxAscent = -1;
    let maxDescent = -1;
    const baselineAligned = this.baselineAligned !== false;
    if (baselineAligned) {
      for (let i = 0; i < count; i++) {
        const child = this.children[i];
        if (isGone(child)) continue;
        const baseline = typeof child.getBaseline === 'function' ? child.getBaseline() : -1;
        if (baseline < 0) continue;
        maxAscent = Math.max(maxAscent, baseline);
        maxDescent = Math.max(maxDescent, child.getMeasuredHeight() - baseline);
      }
    }
    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const childWidth = child.getMeasuredWidth();
      const childHeight = child.getMeasuredHeight();
      let childTop = this.paddingTop + (lp.topMargin || 0);
      const gravity = resolveGravity(this.gravity, lp.gravity);
      const baseline = baselineAligned && maxAscent >= 0 && typeof child.getBaseline === 'function' ? child.getBaseline() : -1;
      if (baseline >= 0 && (gravity & 0x70) !== 0x10 && (gravity & 0x70) !== 0x50) {
        childTop = this.paddingTop + (maxAscent - baseline) + (lp.topMargin || 0);
      } else if ((gravity & 0x70) === 0x10) {
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

export class GridLayout extends ViewGroup {
  constructor(context = null) {
    super(context);
    this.columnCount = 2;
    this.rowCount = 0;
    this.orientation = HORIZONTAL;
  }

  generateDefaultLayoutParams() {
    return {
      width: -2,
      height: -2,
      leftMargin: 0,
      topMargin: 0,
      rightMargin: 0,
      bottomMargin: 0,
      column: -1,
      row: -1,
      columnSpan: 1,
      rowSpan: 1,
    };
  }

  setColumnCount(value) {
    this.columnCount = Math.max(1, value | 0);
    this.requestLayout();
  }

  setRowCount(value) {
    this.rowCount = Math.max(0, value | 0);
    this.requestLayout();
  }

  _placeChildren() {
    let columns = Math.max(1, this.columnCount | 0);
    for (const child of this.children) {
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const col = lp.column | 0;
      const span = Math.max(1, (lp.columnSpan | 0) || 1);
      if (col >= 0) columns = Math.max(columns, col + span);
    }
    const occupied = new Set();
    const key = (row, col) => row + ',' + col;
    const isFree = (row, col, rspan, cspan) => {
      for (let dr = 0; dr < rspan; dr += 1) {
        for (let dc = 0; dc < cspan; dc += 1) {
          if (occupied.has(key(row + dr, col + dc))) return false;
        }
      }
      return true;
    };
    const cells = [];
    let autoRow = 0;
    let autoCol = 0;
    for (const child of this.children) {
      if (isGone(child)) continue;
      const lp = child.layoutParams || this.generateDefaultLayoutParams();
      const cspan = Math.max(1, (lp.columnSpan | 0) || 1);
      const rspan = Math.max(1, (lp.rowSpan | 0) || 1);
      let row = lp.row | 0;
      let col = lp.column | 0;
      if (row < 0 && col < 0) {
        row = autoRow;
        col = autoCol;
        let guard = 0;
        while (!isFree(row, col, rspan, cspan) && guard < 10000) {
          col += 1;
          if (col + cspan > columns) {
            col = 0;
            row += 1;
          }
          guard += 1;
        }
        autoRow = row;
        autoCol = col + cspan;
        if (autoCol + 1 > columns) {
          autoCol = 0;
          autoRow = row + 1;
        }
      } else if (row < 0) {
        row = 0;
        let guard = 0;
        while (!isFree(row, col, rspan, cspan) && guard < 10000) {
          row += 1;
          guard += 1;
        }
      } else if (col < 0) {
        col = 0;
        let guard = 0;
        while (!isFree(row, col, rspan, cspan) && guard < 10000) {
          col += 1;
          if (col + cspan > columns) {
            col = 0;
            break;
          }
          guard += 1;
        }
      }
      for (let dr = 0; dr < rspan; dr += 1) {
        for (let dc = 0; dc < cspan; dc += 1) occupied.add(key(row + dr, col + dc));
      }
      cells.push({ child, lp, row, col, cspan, rspan });
    }
    for (const cell of cells) columns = Math.max(columns, cell.col + cell.cspan);
    return { cells, columns: Math.max(1, columns) };
  }

  _measureCells(cells, widthSpec, widthMode, availW) {
    const colWidths = [];
    const rowHeights = [];
    for (const cell of cells) {
      const { child, lp, cspan, rspan } = cell;
      const marginsH = (lp.leftMargin || 0) + (lp.rightMargin || 0);
      const marginsV = (lp.topMargin || 0) + (lp.bottomMargin || 0);
      let childWidthSpec;
      if ((lp.width | 0) >= 0) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(lp.width | 0, MeasureSpec.EXACTLY);
      } else if (widthMode === MeasureSpec.UNSPECIFIED) {
        childWidthSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      } else {
        childWidthSpec = MeasureSpec.makeMeasureSpec(Math.max(0, availW - marginsH), MeasureSpec.AT_MOST);
      }
      const childHeightSpec = (lp.height | 0) >= 0
        ? MeasureSpec.makeMeasureSpec(lp.height | 0, MeasureSpec.EXACTLY)
        : MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
      child.measure(childWidthSpec, childHeightSpec);
      const measuredWidth = child.getMeasuredWidth() + marginsH;
      const measuredHeight = child.getMeasuredHeight() + marginsV;
      if (cspan === 1) colWidths[cell.col] = Math.max(colWidths[cell.col] || 0, measuredWidth);
      if (rspan === 1) rowHeights[cell.row] = Math.max(rowHeights[cell.row] || 0, measuredHeight);
    }
    for (const cell of cells) {
      const { child, lp, cspan, rspan } = cell;
      const needW = child.getMeasuredWidth() + (lp.leftMargin || 0) + (lp.rightMargin || 0);
      const needH = child.getMeasuredHeight() + (lp.topMargin || 0) + (lp.bottomMargin || 0);
      if (cspan > 1) {
        let sum = 0;
        for (let c = cell.col; c < cell.col + cspan; c += 1) sum += colWidths[c] || 0;
        if (sum < needW) colWidths[cell.col] = (colWidths[cell.col] || 0) + (needW - sum);
      }
      if (rspan > 1) {
        let sum = 0;
        for (let r = cell.row; r < cell.row + rspan; r += 1) sum += rowHeights[r] || 0;
        if (sum < needH) rowHeights[cell.row] = (rowHeights[cell.row] || 0) + (needH - sum);
      }
    }
    return { colWidths, rowHeights };
  }

  onMeasure(widthSpec, heightSpec) {
    const widthMode = MeasureSpec.getMode(widthSpec);
    const availW = Math.max(0, (widthMode === MeasureSpec.UNSPECIFIED ? 0 : MeasureSpec.getSize(widthSpec)) - this.paddingLeft - this.paddingRight);
    const { cells, columns } = this._placeChildren();
    const { colWidths, rowHeights } = this._measureCells(cells, widthSpec, widthMode, availW);
    let contentWidth = this.paddingLeft + this.paddingRight;
    for (let c = 0; c < columns; c += 1) contentWidth += colWidths[c] || 0;
    let contentHeight = this.paddingTop + this.paddingBottom;
    for (let r = 0; r < rowHeights.length; r += 1) contentHeight += rowHeights[r] || 0;
    this.setMeasuredDimension(resolveSize(contentWidth, widthSpec), resolveSize(contentHeight, heightSpec));
  }

  onLayout(changed, left, top, right, bottom) {
    const availW = Math.max(0, right - left - this.paddingLeft - this.paddingRight);
    const { cells, columns } = this._placeChildren();
    const { colWidths, rowHeights } = this._measureCells(cells, MeasureSpec.makeMeasureSpec(availW, MeasureSpec.AT_MOST), MeasureSpec.EXACTLY, availW);
    const colX = [];
    let cursorX = this.paddingLeft;
    for (let c = 0; c < columns; c += 1) {
      colX[c] = cursorX;
      cursorX += colWidths[c] || 0;
    }
    const rowY = [];
    let cursorY = this.paddingTop;
    for (let r = 0; r < rowHeights.length; r += 1) {
      rowY[r] = cursorY;
      cursorY += rowHeights[r] || 0;
    }
    for (const cell of cells) {
      const { child, lp, row, col, cspan, rspan } = cell;
      let cellWidth = 0;
      for (let c = col; c < col + cspan; c += 1) cellWidth += colWidths[c] || 0;
      let cellHeight = 0;
      for (let r = row; r < row + rspan; r += 1) cellHeight += rowHeights[r] || 0;
      const childWidth = Math.max(0, cellWidth - (lp.leftMargin || 0) - (lp.rightMargin || 0));
      const childHeight = Math.max(0, cellHeight - (lp.topMargin || 0) - (lp.bottomMargin || 0));
      const x = (colX[col] || this.paddingLeft) + (lp.leftMargin || 0);
      const y = (rowY[row] || this.paddingTop) + (lp.topMargin || 0);
      child.layout(x, y, x + childWidth, y + childHeight);
    }
  }
}

export class TableLayout extends LinearLayout {
  constructor(context = null) {
    super(context);
    this.orientation = VERTICAL;
    this.mColumns = [];
    this.mStretchAllColumns = false;
    this.mShrinkAllColumns = false;
    this.mStretchableColumnList = null;
    this.mShrinkableColumnList = null;
    this.mCollapsedColumnList = null;
  }
}

export class TableRow extends LinearLayout {
  constructor(context = null) {
    super(context);
    this.orientation = HORIZONTAL;
    this.mColumnWidths = [];
    this.mNumColumns = 0;
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
  const density = view?.getDensity ? view.getDensity() : (vm?.displayMetrics?.density || vm?.resources?.density || 1);
  const fallback = Math.round(56 * density);
  const theme = vm?.themeAttributes;
  const size = theme?.actionBarSize;
  if (typeof size === 'number' && size > 0x01000000) {
    const resolved = vm?.resources?.table?.resolve(size);
    if (typeof resolved === 'number' && resolved > 0) return Math.round(resolved <= 168 ? resolved * density : resolved);
    if (resolved && typeof resolved === 'object' && resolved.dimension) {
      return Math.round(resolved.dimension * density);
    }
    return fallback;
  }
  if (typeof size === 'number' && size > 0) return Math.round(size * (size <= 168 ? density : 1));
  return fallback;
}

function actionBarColorOf(view) {
  const theme = view?.$vm?.themeAttributes;
  const color = theme?.colorPrimary;
  return typeof color === 'number' ? color >>> 0 : 0xff3f51b5;
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
        ctx.font = `${size}px 'Noto Sans CJK SC'`;
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

export class ViewStub extends View {
  constructor(context = null) {
    super(context);
    this.visibility = VISIBILITY.GONE;
    this.$stubLayout = 0;
    this.$stubInflatedId = 0;
    this.$inflated = false;
  }

  inflate() {
    if (this.$inflated) return this.children?.[0] || null;
    const vm = this.$vm;
    const parent = this.parent;
    if (!vm || !parent || !this.$stubLayout) {
      this.visibility = VISIBILITY.VISIBLE;
      return null;
    }
    let view = null;
    try {
      view = vm.inflateRaw
        ? vm.inflateRaw(this.$stubLayout)
        : null;
    } catch {
      view = null;
    }
    this.$inflated = true;
    if (!view) {
      this.visibility = VISIBILITY.VISIBLE;
      return null;
    }
    const index = parent.children.indexOf(this);
    parent.removeView(this);
    if (this.$stubInflatedId && this.$stubInflatedId !== -1) view.id = this.$stubInflatedId >>> 0;
    view.layoutParams = this.layoutParams || { width: -1, height: -1 };
    parent.addView(view, index >= 0 ? index : parent.children.length);
    return view;
  }
}

export class ListView extends ViewGroup {
  constructor(context = null) {
    super(context);
    this.adapter = null;
    this.$onItemClickListener = null;
    this.$onItemSelectedListener = null;
    this.$onScrollListener = null;
    this.divider = null;
    this.dividerHeight = Math.round(1 * this.getDensity());
    this.dividerColor = null;
    this.selector = null;
    this.choiceMode = 0;
    this.$items = [];
    this.$itemCount = -1;
    this.$pressedItem = -1;
    this.$contentHeight = 0;
    this.$touchStartY = 0;
    this.$touchStartScroll = 0;
    this.$dragging = false;
    this.$selectionPadding = { left: 0, top: 0, right: 0, bottom: 0 };
  }

  setDivider(drawable) {
    this.divider = drawable;
    const vm = this.$vm || this.vm;
    let height = 0;
    if (drawable) {
      try {
        height = Number(vm?.invokeByName?.('getIntrinsicHeight', '()I', drawable, []) ?? 0) || 0;
      } catch (_) {
        height = 0;
      }
      if (!height && drawable.type === 'shape') {
        const size = (drawable.xml?.children || []).find((c) => c.name === 'size');
        const attr = size?.attrs?.find((a) => a.name === 'height');
        const value = attr?.value;
        if (value && typeof value === 'object' && value.dimension) {
          height = value.dimension.value * (vm?.resources?.displayMetrics?.density || 1);
        }
      }
    }
    this.dividerHeight = Math.round(height);
    this.requestLayout();
    return this;
  }

  setSelector(drawable) {
    this.selector = drawable;
    const vm = this.$vm || this.vm;
    const padding = { left: 0, top: 0, right: 0, bottom: 0 };
    if (drawable) {
      try {
        const paddingRect = vm?.allocateRawObject?.('Landroid/graphics/Rect;');
        if (paddingRect && vm?.invokeByName?.('getPadding', '(Landroid/graphics/Rect;)Z', drawable, [paddingRect])) {
          const peer = paddingRect.$peer || {};
          padding.left = peer.left | 0;
          padding.top = peer.top | 0;
          padding.right = peer.right | 0;
          padding.bottom = peer.bottom | 0;
        }
      } catch (_) {
        void _;
      }
    }
    this.$selectionPadding = padding;
    this.invalidate();
    return this;
  }

  themeHighlight() {
    const vm = this.$vm || this.vm;
    const theme = vm?.themeAttributes;
    if (theme && typeof theme.colorControlHighlight === 'number') return theme.colorControlHighlight >>> 0;
    return 0x1f000000;
  }

  drawSelector(canvas) {
    const index = this.$pressedItem;
    if (index < 0) return;
    const item = this.$items[index];
    if (!item) return;
    const ctx = canvas.context;
    const pad = this.$selectionPadding;
    const rect = {
      left: item.left - pad.left,
      top: item.top - pad.top,
      right: item.right + pad.right,
      bottom: item.bottom + pad.bottom,
    };
    if (this.selector) {
      drawDrawable(ctx, this.selector, rect, {
        vm: this.$vm || this.vm,
        state: { enabled: true, pressed: true, focused: false, selected: false },
        stateSet: [0x0101009e, 0x010100a7],
      });
      return;
    }
    ctx.save();
    const highlight = this.themeHighlight();
    ctx.fillStyle = 'rgba(0,0,0,' + ((highlight >>> 24) / 255) + ')';
    ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    ctx.restore();
  }

  dividerPaintColor() {
    if (this.dividerColor !== null && this.dividerColor !== undefined) return this.dividerColor >>> 0;
    const vm = this.$vm || this.vm;
    const theme = vm?.themeAttributes;
    if (theme) {
      if (typeof theme.listDivider === 'number') return theme.listDivider >>> 0;
      const ref = theme.$attrReferences?.listDivider;
      if (ref !== undefined) {
        const resolved = vm?.resources?.resolve?.(ref >>> 0);
        if (typeof resolved === 'number' && resolved > 0xffffff) return resolved >>> 0;
      }
    }
    return 0x1f000000;
  }

  drawDividers(canvas) {
    if ((this.dividerHeight | 0) <= 0) return;
    if (!this.divider && !this.$items.length) return;
    const width = this.getWidth();
    const listBottom = this.getHeight() - this.paddingBottom;
    const ctx = canvas.context;
    for (let i = 0; i < this.$items.length; i++) {
      const item = this.$items[i];
      const bottom = item.bottom;
      if (bottom >= listBottom) continue;
      const rect = {
        left: this.paddingLeft,
        top: bottom,
        right: width - this.paddingRight,
        bottom: bottom + this.dividerHeight,
      };
      if (this.divider) {
        drawDrawable(ctx, this.divider, rect, { vm: this.$vm || this.vm });
      } else {
        const color = this.dividerPaintColor();
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,' + (((color >>> 24) & 0xff) / 255) + ')';
        ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
        ctx.restore();
      }
    }
  }

  dispatchDraw(canvas) {
    canvas.save();
    canvas.translate(-(this.scrollX | 0), -(this.scrollY | 0));
    this.drawSelector(canvas);
    for (const child of this.children) child.draw(canvas);
    this.drawDividers(canvas);
    canvas.restore();
  }

  generateDefaultLayoutParams() {
    return { width: -1, height: -2, gravity: -1, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
  }

  invokeAdapter(name, proto, args) {
    const vm = this.$vm || this.vm;
    if (!vm || !this.adapter) return null;
    try {
      return vm.invokeByName(name, proto, this.adapter, args);
    } catch {
      return null;
    }
  }

  adapterCount() {
    const count = this.invokeAdapter('getCount', '()I', []);
    const value = Number(count);
    return Number.isFinite(value) && value > 0 ? value | 0 : 0;
  }

  ensureItems() {
    const count = this.adapterCount();
    const version = this.adapter?.$dirty | 0;
    if (count === this.$itemCount && this.$items.length === count && version === (this.$adapterVersion | 0)) return;
    const previous = this.$items || [];
    this.$items = [];
    this.children = [];
    this.$itemCount = count;
    this.$adapterVersion = version;
    const vm = this.$vm || this.vm;
    if (!vm || !this.adapter) return;
    const parent = this.$javaObject || null;
    for (let i = 0; i < count; i += 1) {
      let item = null;
      const convertView = previous[i]?.$javaObject || null;
      try {
        const object = vm.invokeByName(
          'getView',
          '(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;',
          this.adapter,
          [i, convertView, parent],
        );
        item = object?.$view || object?.$peer?.view || previous[i] || null;
      } catch {
        item = null;
      }
      if (!item) continue;
      item.parent = this;
      this.$items.push(item);
      this.children.push(item);
    }
  }

  firstVisiblePosition() {
    const scrollY = this.scrollY | 0;
    for (let i = 0; i < this.$items.length; i += 1) {
      const item = this.$items[i];
      if (item.bottom > scrollY) return i;
    }
    return 0;
  }

  lastVisiblePosition() {
    const bottom = (this.scrollY | 0) + this.getHeight();
    for (let i = this.$items.length - 1; i >= 0; i -= 1) {
      const item = this.$items[i];
      if (item.top < bottom) return i;
    }
    return Math.max(0, this.$items.length - 1);
  }

  onMeasure(widthSpec, heightSpec) {
    this.ensureItems();
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    let maxWidth = 0;
    let totalHeight = 0;
    const widthSize = widthMode === MeasureSpec.UNSPECIFIED ? 0 : MeasureSpec.getSize(widthSpec);
    const childWidthSpec = widthMode === MeasureSpec.UNSPECIFIED
      ? MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)
      : getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight, -1);
    const availableHeight = heightMode === MeasureSpec.UNSPECIFIED ? 0 : MeasureSpec.getSize(heightSpec);
    const childHeightSpec = availableHeight > 0
      ? MeasureSpec.makeMeasureSpec(availableHeight, MeasureSpec.AT_MOST)
      : MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED);
    for (const item of this.$items) {
      if (isGone(item)) continue;
      item.measure(childWidthSpec, childHeightSpec);
      const height = item.getMeasuredHeight();
      totalHeight += height + this.dividerHeight;
      maxWidth = Math.max(maxWidth, item.getMeasuredWidth());
    }
    if (widthMode !== MeasureSpec.UNSPECIFIED) maxWidth = Math.max(maxWidth, widthSize - this.paddingLeft - this.paddingRight);
    this.setMeasuredDimension(
      resolveSize(maxWidth + this.paddingLeft + this.paddingRight, widthSpec),
      resolveSize(totalHeight + this.paddingTop + this.paddingBottom, heightSpec),
    );
  }

  onLayout(changed, left, top, right, bottom) {
    let y = this.paddingTop;
    for (const item of this.$items) {
      if (isGone(item)) continue;
      const width = item.getMeasuredWidth();
      const height = item.getMeasuredHeight();
      item.layout(this.paddingLeft, y, this.paddingLeft + width, y + height);
      y += height + this.dividerHeight;
    }
    this.$contentHeight = y + this.paddingBottom;
    this.scrollRange = Math.max(0, this.$contentHeight - (bottom - top));
    this.scrollY = Math.max(0, Math.min(this.scrollRange, this.scrollY | 0));
  }

  scrollTo(x, y) {
    this.scrollX = 0;
    this.scrollY = Math.max(0, Math.min(this.scrollRange || 0, y | 0));
    this.invalidate();
  }

  itemIndexAt(x, y) {
    const localY = y - this.paddingTop;
    let cursor = 0;
    for (let i = 0; i < this.$items.length; i += 1) {
      const item = this.$items[i];
      if (isGone(item)) continue;
      const height = item.getMeasuredHeight();
      if (localY >= cursor && localY < cursor + height) return i;
      cursor += height + this.dividerHeight;
    }
    return -1;
  }

  performItemClick(position) {
    const vm = this.$vm || this.vm;
    const item = this.$items[position | 0];
    if (!vm || !item) return false;
    const listener = this.$onItemClickListener;
    if (listener) {
      let id = position | 0;
      try {
        const value = vm.invokeByName('getItemId', '(I)J', this.adapter, [position | 0]);
        if (value !== null && value !== undefined) id = value;
      } catch {
        id = position | 0;
      }
      try {
        vm.invokeByName(
          'onItemClick',
          '(Landroid/widget/AdapterView;Landroid/view/View;IJ)V',
          listener,
          [this.$javaObject || null, item.$javaObject || null, position | 0, id],
        );
        this.$dismissPopup?.();
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  onTouchEvent(event) {
    const host = toHostTouchEvent(event);
    if (host.action === 'down') {
      this.$pressedItem = this.itemIndexAt(host.x, host.y + (this.scrollY | 0) - this.paddingTop);
      this.$touchStartY = host.y;
      this.$touchStartScroll = this.scrollY | 0;
      this.$dragging = false;
      this.pressed = this.$pressedItem >= 0;
      return this.pressed || this.scrollRange > 0;
    }
    if (host.action === 'move') {
      const delta = this.$touchStartY - host.y;
      if (Math.abs(delta) > 8 && this.scrollRange > 0) {
        this.$dragging = true;
        this.$pressedItem = -1;
        this.pressed = false;
        this.scrollTo(0, this.$touchStartScroll + delta);
      }
      return true;
    }
    if (host.action === 'up') {
      const dragged = this.$dragging;
      this.$dragging = false;
      if (dragged) {
        this.$pressedItem = -1;
        this.pressed = false;
        return true;
      }
      const index = this.itemIndexAt(host.x, host.y + (this.scrollY | 0) - this.paddingTop);
      const pressed = this.$pressedItem;
      this.$pressedItem = -1;
      this.pressed = false;
      if (index >= 0 && index === pressed) return this.performItemClick(index) || true;
      return true;
    }
    if (host.action === 'cancel') {
      this.$pressedItem = -1;
      this.pressed = false;
      return true;
    }
    return false;
  }
}
