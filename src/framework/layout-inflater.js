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
  WebView,
} from './widgets.js';
import {
  ActionBarContainer,
  ActionBarOverlayLayout,
  AbsoluteLayout,
  CoordinatorLayout,
  DrawerLayout,
  FrameLayout,
  HorizontalScrollView,
  LinearLayout,
  RelativeLayout,
  TableLayout,
  TableRow,
  Toolbar,
  SimpleFrameHost,
  ViewPagerHost,
  ViewStub,
  TabLayoutHost,
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
  'android.widget.AbsoluteLayout': AbsoluteLayout,
  'android.widget.TextView': TextView,
  'android.widget.Button': Button,
  'android.widget.EditText': EditText,
  'android.widget.ImageView': ImageView,
  'android.widget.ScrollView': ScrollView,
  'android.widget.HorizontalScrollView': HorizontalScrollView,
  'android.widget.ProgressBar': ProgressBar,
  'android.widget.TableLayout': TableLayout,
  'android.widget.TableRow': TableRow,
  'android.widget.Space': View,
  'android.webkit.WebView': WebView,
  'androidx.drawerlayout.widget.DrawerLayout': DrawerLayout,
  'androidx.coordinatorlayout.widget.CoordinatorLayout': CoordinatorLayout,
  'androidx.appcompat.widget.Toolbar': Toolbar,
  'androidx.appcompat.widget.ActionBarContainer': ActionBarContainer,
  'androidx.appcompat.widget.ActionBarOverlayLayout': ActionBarOverlayLayout,
};

export class LayoutInflater {
  constructor(context) {
    this.context = context;
    this.resources = context.getResources();
    this.vm = context?.vm || context?.$vm || null;
  }

  inflate(resId, root = null, attachToRoot = false) {
    if (globalThis.__DBG_CV) console.error('INFLATE_CALL res=0x' + (resId>>>0).toString(16) + ' root=' + (root?.$descriptor || (root && root.constructor?.name) || 'null') + ' attach=' + attachToRoot);
    const xml = this.resources.getLayout(resId);
    const node = xml.root.children.find((c) => c.type === 'element');
    if (!node) throw new Error('布局 XML 无根节点');
    if (node.name === 'merge') {
      if (!(root instanceof ViewGroup)) {
        throw new Error('merge 布局需要 ViewGroup 作为根');
      }
      for (const childNode of node.children) {
        if (childNode.type !== 'element') continue;
        const child = this.inflateNode(childNode, root);
        if (child) root.addView(child);
      }
      return root;
    }
    const view = this.inflateNode(node, root);
    if (root && attachToRoot && root instanceof ViewGroup) root.addView(view);
    return view;
  }

  inflateNode(node, parent) {
    if (!node || node.type !== 'element') return null;
    if (node.name === 'include') return this.inflateInclude(node, parent);
    const view = this.createView(node);
    this.applyAttributes(view, node);
    if (view instanceof ViewGroup || typeof view.addView === 'function') {
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
    if (globalThis.__DBG_CV && /DrawerLayout|AppBarLayout|CoordinatorLayout|Toolbar|TabLayout/.test(tag)) console.error('CV tag=' + tag);
    const fullName = tag.includes('.') ? tag : `android.widget.${tag}`;
    if (fullName === 'androidx.appcompat.widget.ViewStubCompat' || fullName === 'android.view.ViewStub') {
      const stub = new ViewStub(this.context);
      stub.$descriptor = `L${fullName.replace(/\./g, '/')};`;
      const vm = this.context?.vm || this.context?.$vm || this.vm || null;
      if (vm) stub.$vm = vm;
      return stub;
    }
    const ctor = RESOLVED_CLASSES[fullName] || RESOLVED_CLASSES[tag] || VIEW_CLASSES[tag];
    if (!ctor) {
      const base = this.baseFromDexSuperclass(fullName) || View;
      const fallback = new base(this.context);
      fallback.$unknownTag = fullName;
      fallback.$descriptor = `L${fullName.replace(/\./g, '/')};`;
      this.runDexConstructor(fallback, node);
      return fallback;
    }
    const view = new ctor(this.context);
    if (fullName.startsWith('androidx.') || fullName.startsWith('com.google.')) view.$descriptor = `L${fullName.replace(/\./g, '/')};`;
    this.runDexConstructor(view, node);
    return view;
  }

  baseFromDexSuperclass(fullName) {
    const vm = this.context?.vm || this.context?.$vm || this.vm || null;
    if (!vm) return null;
    const nativeBaseBySuper = {
      'Landroid/view/View;': View,
      'Landroid/view/ViewGroup;': FrameLayout,
      'Landroid/widget/FrameLayout;': FrameLayout,
      'Landroid/widget/LinearLayout;': LinearLayout,
      'Landroid/widget/RelativeLayout;': RelativeLayout,
      'Landroid/widget/AbsoluteLayout;': AbsoluteLayout,
      'Landroid/widget/TableLayout;': TableLayout,
      'Landroid/widget/TableRow;': TableRow,
      'Landroid/widget/Toolbar;': Toolbar,
      'Landroid/widget/ScrollView;': ScrollView,
      'Landroid/widget/HorizontalScrollView;': HorizontalScrollView,
      'Landroid/widget/TextView;': TextView,
      'Landroid/widget/Button;': Button,
      'Landroid/widget/EditText;': EditText,
      'Landroid/widget/ImageView;': ImageView,
      'Landroid/widget/ProgressBar;': ProgressBar,
      'Landroid/webkit/WebView;': WebView,
      'Landroidx/drawerlayout/widget/DrawerLayout;': DrawerLayout,
      'Landroidx/coordinatorlayout/widget/CoordinatorLayout;': CoordinatorLayout,
      'Landroidx/appcompat/widget/Toolbar;': Toolbar,
      'Landroidx/appcompat/widget/ActionBarContainer;': ActionBarContainer,
      'Landroidx/appcompat/widget/ActionBarOverlayLayout;': ActionBarOverlayLayout,
    };
    let desc = `L${fullName.replace(/\./g, '/')};`;
    const visited = new Set();
    for (;;) {
      if (!desc || visited.has(desc)) return null;
      visited.add(desc);
      if (nativeBaseBySuper[desc]) return nativeBaseBySuper[desc];
      const superDesc = vm.registry.findDexClass?.(desc)?.superclass || null;
      if (!superDesc) return null;
      desc = superDesc;
    }
  }

  buildAttributeSet(node) {
    const vm = this.context?.vm || this.context?.$vm || this.vm || null;
    if (!vm || !node) return null;
    const object = vm.allocateRawObject('Landroid/util/AttributeSet;');
    object.$peer = {
      $descriptor: 'Landroid/util/AttributeSet;',
      node,
      resources: this.resources,
      getAttributeCount: () => (node.attrs || []).length,
      getIdAttributeResourceValue: (index, fallback) => {
        const attr = (node.attrs || [])[index | 0];
        return attr ? (attr.resId >>> 0) || fallback : fallback;
      },
    };
    object.$attrNode = node;
    object.$attrResources = this.resources;
    return object;
  }

  runDexConstructor(view, node = null) {
    const vm = this.context?.vm || this.context?.$vm || this.vm || null;
    if (!vm || !view?.$descriptor) return null;
    const dexClass = vm.registry.resolve(view.$descriptor)?.dexClass;
    if (!dexClass) return null;
    const directMethods = dexClass.directMethods || [];
    const findCtor = (desc) => directMethods.find((m) => m.name === '<init>' && m.proto?.descriptor === desc);
    const attrSet = node ? this.buildAttributeSet(node) : null;
    const contextObject = vm.contextObject || this.context;

    const withAttrs = attrSet ? findCtor('(Landroid/content/Context;Landroid/util/AttributeSet;)V') : null;
    const ctor = withAttrs || findCtor('(Landroid/content/Context;)V');
    if (!ctor) return null;
    const object = viewObject(vm, view);
    const args = withAttrs ? [contextObject, attrSet] : [contextObject];
    try {
      vm.executeMethod(ctor, object, args);
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

    if (view instanceof ViewStub) {
      const layoutAttr = getByName('layout') || node.attrs.find((a) => a.resId === 0x010100f2);
      if (layoutAttr) {
        view.$stubLayout = layoutAttr.value?.reference !== undefined ? (layoutAttr.value.reference >>> 0) : (layoutAttr.data >>> 0);
      }
      const inflatedAttr = getByName('inflatedId');
      if (inflatedAttr) {
        view.$stubInflatedId = inflatedAttr.value?.reference !== undefined ? (inflatedAttr.value.reference >>> 0) : (inflatedAttr.data >>> 0);
      }
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
      const value = resolveDimensionAttr(attr, resources, density);
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
      const value = resolveDimensionAttr(paddingAttr, resources, density);
      view.setPadding(value, value, value, value);
    }
    const paddingLeft = get(ATTR_IDS.paddingLeft);
    if (paddingLeft) view.paddingLeft = resolveDimensionAttr(paddingLeft, resources, density);
    const paddingTop = get(ATTR_IDS.paddingTop);
    if (paddingTop) view.paddingTop = resolveDimensionAttr(paddingTop, resources, density);
    const paddingRight = get(ATTR_IDS.paddingRight);
    if (paddingRight) view.paddingRight = resolveDimensionAttr(paddingRight, resources, density);
    const paddingBottom = get(ATTR_IDS.paddingBottom);
    if (paddingBottom) view.paddingBottom = resolveDimensionAttr(paddingBottom, resources, density);

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

    if (view instanceof TabLayoutHost) {
      const toColor = (attr) => {
        if (!attr) return null;
        const value = resolveAttrValue(attr, resources);
        if (typeof value === 'number') return value >>> 0;
        if (typeof value === 'string') return parseColorString(value);
        return null;
      };
      const tabBg = getByName('tabBackground');
      if (tabBg) view.$tabBackground = toColor(tabBg);
      const indicator = getByName('tabIndicatorColor');
      if (indicator) view.$tabIndicatorColor = toColor(indicator);
      const selected = getByName('tabSelectedTextColor');
      if (selected) view.$tabSelectedTextColor = toColor(selected);
      const unselected = getByName('tabTextColor');
      if (unselected) view.$tabTextColor = toColor(unselected);
      const tabMode = getByName('tabMode');
      if (tabMode) view.$tabMode = Number(tabMode.value) | 0;
      const tabGravity = getByName('tabGravity');
      if (tabGravity) view.$tabGravity = Number(tabGravity.value) | 0;
      const indicatorHeight = getByName('tabIndicatorHeight');
      if (indicatorHeight) view.$tabIndicatorHeight = resolveDimensionAttr(indicatorHeight, resources, density);
    }

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
      const textAttr = get(ATTR_IDS.text) || getByName('text');
      if (textAttr) view.setText(resolvedString(textAttr, resources));
      const textSizeAttr = get(ATTR_IDS.textSize);
      if (textSizeAttr) view.setTextSize(resolveDimensionAttr(textSizeAttr, resources, density));
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

    {
      const minWidthAttr = get(ATTR_IDS.minWidth) || getByName('minWidth');
      if (minWidthAttr) view.minWidth = resolveDimensionAttr(minWidthAttr, resources, density);
      const minHeightAttr = get(ATTR_IDS.minHeight) || getByName('minHeight');
      if (minHeightAttr) view.minHeight = resolveDimensionAttr(minHeightAttr, resources, density);
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
  let value = attr.value;
  const themeAttrs = resources?.vm?.themeAttributes;
  if (globalThis.__DBG_TLS) console.error('TLS name=' + attr.name + ' dt=' + attr.dataType + ' data=0x' + (attr.data>>>0).toString(16) + ' hasTheme=' + !!themeAttrs + ' actBar=' + JSON.stringify(themeAttrs?.actionBarSize) + ' vm=' + !!resources?.vm);
  if (themeAttrs && (attr.dataType === 0x01 || attr.dataType === 0x02) && (attr.data >>> 0) > 0) {
    const entry = resources.table?.getEntry(attr.data >>> 0);
    const key = entry?.key || attr.name;
    const themeValue = key ? themeAttrs[key] : undefined;
    if (themeValue !== undefined && themeValue !== null) {
      if (typeof themeValue === 'number') return Math.round(themeValue > 0 && themeValue <= 168 ? themeValue * density : themeValue);
      if (typeof themeValue === 'object' && themeValue.dimension !== undefined) {
        return Math.round(convertDimension(themeValue, density));
      }
    }
  }
  if (
    typeof value === 'number' &&
    (value >>> 0) >= 0x01000000 &&
    (value >>> 0) <= 0x7fffffff &&
    resources?.resolve
  ) {
    const resolved = resources.resolve(value >>> 0);
    if (resolved !== null && resolved !== undefined) value = resolved;
  }
  if (typeof value === 'number') {
    if (attr.dataType === 0x02) return -2;
    return value;
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
  if (attr.dataType === 0x02 && (attr.data >>> 0) > 0 && resources?.table) {
    const entry = resources.table.getEntry(attr.data >>> 0);
    const key = entry?.key;
    const themeAttrs = resources?.vm?.themeAttributes;
    const themeValue = key ? themeAttrs?.[key] : undefined;
    if (themeValue !== undefined && themeValue !== null) {
      if (typeof themeValue === 'number') return themeValue;
      if (typeof themeValue === 'object' && themeValue.dimension !== undefined) return themeValue;
    }
    if (key === 'actionBarSize') return { dimension: { value: 56, unit: 'dp', raw: 1 } };
  }
  return value;
}

function resolveDimensionAttr(attr, resources, density) {
  if (!attr) return 0;
  return convertDimension(resolveAttrValue(attr, resources), density);
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
