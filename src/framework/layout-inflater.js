import { ATTR_IDS, typedValueToNumber } from '../res/axml.js';
import { convertDimension, parseColorString } from './resources.js';
import { viewObject } from './bridge.js';
import {
  VISIBILITY,
  View,
  ViewGroup,
} from './view.js';
import {
  Button,
  EditText,
  ImageView,
  ProgressBar,
  ScrollView,
  TextView,
} from './widgets.js';
import { ActionBarContainer, ActionBarOverlayLayout, Toolbar } from './layouts.js';
import {
  FrameLayout,
  LinearLayout,
  RelativeLayout,
} from './layouts.js';

const VIEW_CLASSES = {
  View,
  ViewGroup,
  LinearLayout,
  FrameLayout,
  RelativeLayout,
  TextView,
  Button,
  EditText,
  ImageView,
  ScrollView,
  ProgressBar,
};

const RESOLVED_CLASSES = {
  'android.view.View': View,
  'android.view.ViewGroup': ViewGroup,
  'android.widget.LinearLayout': LinearLayout,
  'android.widget.FrameLayout': FrameLayout,
  'android.widget.RelativeLayout': RelativeLayout,
  'android.widget.TextView': TextView,
  'android.widget.Button': Button,
  'android.widget.EditText': EditText,
  'android.widget.ImageView': ImageView,
  'android.widget.ScrollView': ScrollView,
  'android.widget.ProgressBar': ProgressBar,
  'android.widget.Space': View,
};

function inferViewBase(fullName) {
  const name = fullName.split('.').pop();
  if (/RelativeLayout$/.test(name)) return RelativeLayout;
  if (/ActionBarOverlayLayout$/.test(name)) return ActionBarOverlayLayout;
  if (/ActionBarContainer$/.test(name)) return ActionBarContainer;
  if (/OverlayLayout$/.test(name)) return FrameLayout;
  if (/FrameLayout$/.test(name)) return FrameLayout;
  if (/ContentFrameLayout$/.test(name)) return FrameLayout;
  if (/Toolbar$/.test(name)) return Toolbar;
  if (/Layout$/.test(name) || /ViewGroup$/.test(name)) {
    return LinearLayout;
  }
  if (/Button$/.test(name)) return Button;
  if (/EditText$/.test(name)) return EditText;
  if (/ImageView$/.test(name)) return ImageView;
  if (/ScrollView$/.test(name)) return ScrollView;
  if (/ProgressBar$/.test(name)) return ProgressBar;
  if (/TextView$/.test(name)) return TextView;
  return View;
}

export class LayoutInflater {
  constructor(context) {
    this.context = context;
    this.resources = context.getResources();
    this.vm = context?.vm || context?.$vm || null;
  }

  inflate(resId, root = null, attachToRoot = false) {
    const xml = this.resources.getLayout(resId);
    const node = xml.root.children.find((c) => c.type === 'element');
    if (!node) throw new Error('布局 XML 无根节点');
    const view = this.inflateNode(node, root);
    if (root && attachToRoot && root instanceof ViewGroup) root.addView(view);
    return view;
  }

  inflateNode(node, parent) {
    if (!node || node.type !== 'element') return null;
    if (node.name === 'include') return this.inflateInclude(node, parent);
    const view = this.createView(node);
    this.applyAttributes(view, node);
    if (view instanceof ViewGroup) {
      for (const childNode of node.children) {
        if (childNode.type !== 'element') continue;
        const child = this.inflateNode(childNode, view);
        if (child) view.addView(child);
      }
    }
    return view;
  }

  inflateInclude(node, parent) {
    const layoutAttr = (node.attrs || []).find((a) => a.resId === 0x010100f2 || a.name === 'layout');
    const resId = layoutAttr
      ? (typeof layoutAttr.value === 'object' && layoutAttr.value?.reference !== undefined
        ? layoutAttr.value.reference
        : (layoutAttr.data >>> 0))
      : 0;
    if (!resId) return null;
    const xml = this.resources.getLayout(resId);
    const root = xml.root.children.find((c) => c.type === 'element');
    if (!root) return null;
    if (root.name === 'merge') {
      const children = root.children.filter((c) => c.type === 'element').map((c) => this.inflateNode(c, parent));
      this.applyAttributes(children[0], node);
      return children[0] || null;
    }
    const view = this.inflateNode(root, parent);
    this.applyAttributes(view, node);
    return view;
  }

  createView(node) {
    const tag = node.name;
    const fullName = tag.includes('.') ? tag : `android.widget.${tag}`;
    const ctor = RESOLVED_CLASSES[fullName] || RESOLVED_CLASSES[tag] || VIEW_CLASSES[tag];
    if (!ctor) {
      const base = inferViewBase(fullName);
      const fallback = new base(this.context);
      fallback.$unknownTag = fullName;
      fallback.$descriptor = `L${fullName.replace(/\./g, '/')};`;
      this.runDexConstructor(fallback);
      return fallback;
    }
    const view = new ctor(this.context);
    if (fullName.startsWith('androidx.')) view.$descriptor = `L${fullName.replace(/\./g, '/')};`;
    this.runDexConstructor(view);
    return view;
  }

  runDexConstructor(view) {
    const vm = this.context?.vm || this.context?.$vm || this.vm || null;
    if (!vm || !view?.$descriptor) return null;
    const dexClass = vm.registry.resolve(view.$descriptor)?.dexClass;
    if (!dexClass) return null;
    const ctor = (dexClass.directMethods || []).find(
      (m) => m.name === '<init>' && m.proto?.descriptor === '(Landroid/content/Context;)V'
    );
    if (!ctor) return null;
    const object = viewObject(vm, view);
    try {
      vm.executeMethod(ctor, object, [vm.contextObject || this.context]);
      return object;
    } catch (error) {
      if (error?.name === 'VMRuntimeError' || error?.javaException) return object;
      throw error;
    }
  }

  applyAttributes(view, node) {
    const get = (id) => node.attrs.find((a) => a.resId === id) || null;
    const getByName = (name) => node.attrs.find((a) => a.name === name) || null;
    const resources = this.resources;
    const density = resources.density || 1;

    const params = view instanceof ViewGroup
      ? view.generateDefaultLayoutParams?.() || { width: -2, height: -2 }
      : { width: -2, height: -2 };
    const lp = {
      width: -2,
      height: -2,
      weight: 0,
      gravity: -1,
      leftMargin: 0,
      topMargin: 0,
      rightMargin: 0,
      bottomMargin: 0,
      ...params,
    };

    const idAttr = get(ATTR_IDS.id);
    if (idAttr) {
      view.id = typeof idAttr.value === 'object' && idAttr.value?.reference !== undefined
        ? idAttr.value.reference
        : (idAttr.data >>> 0);
    }

    const widthAttr = get(ATTR_IDS.layout_width);
    if (widthAttr) lp.width = toLayoutSize(widthAttr, resources, density);
    const heightAttr = get(ATTR_IDS.layout_height);
    if (heightAttr) lp.height = toLayoutSize(heightAttr, resources, density);

    const weightAttr = get(ATTR_IDS.weight);
    if (weightAttr) lp.weight = Number(weightAttr.value) || 0;

    const layoutGravityAttr = get(ATTR_IDS.layout_gravity);
    if (layoutGravityAttr) lp.gravity = Number(layoutGravityAttr.value) | 0;

    const marginAttrs = [
      ['layout_margin', 'leftMargin', 'topMargin', 'rightMargin', 'bottomMargin'],
      ['layout_marginLeft', 'leftMargin'],
      ['layout_marginTop', 'topMargin'],
      ['layout_marginRight', 'rightMargin'],
      ['layout_marginBottom', 'bottomMargin'],
    ];
    for (const [name, ...targets] of marginAttrs) {
      const attr = get(ATTR_IDS[name]);
      if (!attr) continue;
      const value = convertDimension(attr.value, density);
      for (const target of targets) lp[target] = value;
    }

    view.layoutParams = lp;

    const relativeRuleAttrs = [
      ['layout_alignParentTop', 'alignParentTop', 'bool'],
      ['layout_alignParentBottom', 'alignParentBottom', 'bool'],
      ['layout_alignParentLeft', 'alignParentLeft', 'bool'],
      ['layout_alignParentRight', 'alignParentRight', 'bool'],
      ['layout_centerInParent', 'centerInParent', 'bool'],
      ['layout_centerHorizontal', 'centerHorizontal', 'bool'],
      ['layout_centerVertical', 'centerVertical', 'bool'],
      ['layout_below', 'below', 'id'],
      ['layout_above', 'above', 'id'],
      ['layout_toLeftOf', 'toLeftOf', 'id'],
      ['layout_toRightOf', 'toRightOf', 'id'],
      ['layout_alignTop', 'alignTop', 'id'],
      ['layout_alignBottom', 'alignBottom', 'id'],
      ['layout_alignLeft', 'alignLeft', 'id'],
      ['layout_alignRight', 'alignRight', 'id'],
    ];
    for (const [attrName, ruleName, kind] of relativeRuleAttrs) {
      const attr = get(ATTR_IDS[attrName]);
      if (!attr) continue;
      lp.rules ||= {};
      if (kind === 'id') {
        let ref = attr.value?.reference ?? attr.data ?? attr.value;
        if (typeof ref === 'string') {
          const name = ref.replace(/^@(id|\+id)\//, '');
          const resolved = this.resources.getIdentifier(name, 'id');
          ref = resolved || ref;
        }
        if (typeof ref === 'number') lp.rules[ruleName] = ref >>> 0;
      } else {
        const value = attr.value;
        lp.rules[ruleName] = typeof value === 'boolean' ? value : Number(value) !== 0;
      }
    }

    const paddingAttr = get(ATTR_IDS.padding);
    if (paddingAttr) {
      const value = convertDimension(paddingAttr.value, density);
      view.setPadding(value, value, value, value);
    }
    const paddingLeft = get(ATTR_IDS.paddingLeft);
    if (paddingLeft) view.paddingLeft = convertDimension(paddingLeft.value, density);
    const paddingTop = get(ATTR_IDS.paddingTop);
    if (paddingTop) view.paddingTop = convertDimension(paddingTop.value, density);
    const paddingRight = get(ATTR_IDS.paddingRight);
    if (paddingRight) view.paddingRight = convertDimension(paddingRight.value, density);
    const paddingBottom = get(ATTR_IDS.paddingBottom);
    if (paddingBottom) view.paddingBottom = convertDimension(paddingBottom.value, density);

    const backgroundAttr = get(ATTR_IDS.background);
    if (backgroundAttr) {
      const resolved = resources.resolve(backgroundAttr.value?.reference ?? backgroundAttr.value);
      if (typeof resolved === 'number') {
        view.background = { type: 'color', color: resolved >>> 0 };
      } else if (typeof resolved === 'string' && resolved.endsWith('.xml')) {
        const drawable = resources.getDrawable(backgroundAttr.value.reference);
        view.background = drawable;
      } else if (typeof resolved === 'string') {
        const color = parseColorString(resolved);
        if (color !== null) view.background = { type: 'color', color };
      }
    }

    const backgroundTint = get(ATTR_IDS.backgroundTint);
    if (backgroundTint) {
      const resolved = resolveAttrValue(backgroundTint, resources);
      if (typeof resolved === 'number') view.backgroundTint = resolved >>> 0;
    }

    const visibilityAttr = get(ATTR_IDS.visibility);
    if (visibilityAttr) view.visibility = Number(visibilityAttr.value) | 0;

    const alphaAttr = get(ATTR_IDS.alpha);
    if (alphaAttr) view.alpha = Number(alphaAttr.value) || 1;

    const enabledAttr = get(ATTR_IDS.enabled);
    if (enabledAttr) view.enabled = Boolean(enabledAttr.value);

    if (view instanceof LinearLayout) {
      const orientationAttr = get(ATTR_IDS.orientation);
      if (orientationAttr) view.orientation = Number(orientationAttr.value) | 0;
      const gravityAttr = get(ATTR_IDS.gravity);
      if (gravityAttr) view.gravity = Number(gravityAttr.value) | 0;
    }

    if (view instanceof ViewGroup) {
      const gravityAttr = get(ATTR_IDS.gravity);
      if (gravityAttr && !(view instanceof LinearLayout)) view.foregroundGravity = Number(gravityAttr.value) | 0;
    }

    if (view instanceof TextView) {
      const textAttr = get(ATTR_IDS.text);
      if (textAttr) view.setText(resolvedString(textAttr, resources));
      const textSizeAttr = get(ATTR_IDS.textSize);
      if (textSizeAttr) view.setTextSize(convertDimension(textSizeAttr.value, density));
      const textColorAttr = get(ATTR_IDS.textColor);
      if (textColorAttr) {
        const resolved = resolveAttrValue(textColorAttr, resources);
        if (typeof resolved === 'number') view.setTextColor(resolved >>> 0);
      }
      const textStyleAttr = get(ATTR_IDS.textStyle);
      if (textStyleAttr) view.setTextStyle(Number(textStyleAttr.value) | 0);
      const textAllCapsAttr = get(ATTR_IDS.textAllCaps);
      if (textAllCapsAttr) view.setTextAllCaps(Boolean(textAllCapsAttr.value));
      const gravityAttr = get(ATTR_IDS.gravity);
      if (gravityAttr) view.gravity = Number(gravityAttr.value) | 0;
      const hintAttr = getByName('hint');
      if (hintAttr) view.hintText = resolvedString(hintAttr, resources);
      const maxLinesAttr = getByName('maxLines');
      if (maxLinesAttr) view.maxLines = Number(maxLinesAttr.value) | 0;
      const singleLineAttr = getByName('singleLine');
      if (singleLineAttr) view.singleLine = Boolean(singleLineAttr.value);
    }

    if (view instanceof Button) {
      const minWidthAttr = get(ATTR_IDS.minWidth);
      if (minWidthAttr) view.minWidth = convertDimension(minWidthAttr.value, density);
      const minHeightAttr = get(ATTR_IDS.minHeight);
      if (minHeightAttr) view.minHeight = convertDimension(minHeightAttr.value, density);
    }

    if (view instanceof ImageView) {
      const srcAttr = get(ATTR_IDS.src);
      if (srcAttr && srcAttr.value?.reference !== undefined) {
        view.drawable = resources.getDrawable(srcAttr.value.reference);
      }
      const scaleAttr = getByName('scaleType');
      if (scaleAttr) view.scaleType = String(scaleAttr.value);
    }

    if (view instanceof ProgressBar) {
      const progressAttr = getByName('progress');
      if (progressAttr) view.progress = Number(progressAttr.value) || 0;
    }

    const tagAttr = getByName('tag');
    if (tagAttr) view.tag = String(tagAttr.value ?? '');
    return view;
  }
}

function toLayoutSize(attr, resources, density) {
  const value = attr.value;
  if (typeof value === 'number') return value;
  const themeAttrs = resources?.vm?.themeAttributes;
  if (themeAttrs && attr.dataType === 0x01 && (attr.data >>> 0) > 0) {
    const entry = resources.table?.getEntry(attr.data >>> 0);
    const key = entry?.key || attr.name;
    const themeValue = key ? themeAttrs[key] : undefined;
    if (themeValue !== undefined && themeValue !== null) {
      if (typeof themeValue === 'number') return Math.round(themeValue);
      if (typeof themeValue === 'object' && themeValue.dimension !== undefined) {
        return Math.round(convertDimension(themeValue, density));
      }
    }
  }
  if (value && typeof value === 'object' && value.dimension) {
    return Math.round(convertDimension(value, density));
  }
  if (attr.dataType === 0x10 || attr.dataType === 0x11) {
    return attr.data | 0;
  }
  return -2;
}

function resolveAttrValue(attr, resources) {
  const value = attr.value;
  if (value && typeof value === 'object' && value.reference !== undefined) {
    return resources.resolve(value.reference);
  }
  return value;
}

function resolvedString(attr, resources) {
  const value = resolveAttrValue(attr, resources);
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return String(attr.rawValue ?? '');
  return String(value);
}

export function createViewFromTag(context, tag) {
  const fullName = tag.includes('.') ? tag : `android.widget.${tag}`;
  const ctor = RESOLVED_CLASSES[fullName] || VIEW_CLASSES[tag];
  return ctor ? new ctor(context) : new View(context);
}
