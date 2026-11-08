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
  AbsoluteLayout,
  FrameLayout,
  GridLayout,
  HorizontalScrollView,
  LinearLayout,
  ListView,
  RelativeLayout,
  TableLayout,
  TableRow,
  Toolbar,
  ViewStub,
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
  'android.widget.ListView': ListView,
  'android.widget.ProgressBar': ProgressBar,
  'android.widget.TableLayout': TableLayout,
  'android.widget.TableRow': TableRow,
  'android.widget.GridLayout': GridLayout,
  'android.widget.Space': View,
  'android.webkit.WebView': WebView,
};

function findNestedLayoutParamsClass(vm, parentDescriptor) {
  const targets = ['Landroid/view/ViewGroup$LayoutParams;', 'Landroid/view/ViewGroup$MarginLayoutParams;'];
  let best = null;
  let bestDepth = -1;
  const sources = [vm?.dexFile, ...(Array.isArray(vm?.dexFiles) ? vm.dexFiles : [])];
  for (const dex of sources) {
    if (!dex || !Array.isArray(dex.classes)) continue;
    for (const cls of dex.classes) {
      const descriptor = cls?.descriptor;
      if (typeof descriptor !== 'string') continue;
      if (!descriptor.startsWith(parentDescriptor.slice(0, -1) + '$')) continue;
      const superDescriptor = cls.superclass;
      if (!superDescriptor) continue;
      let depth = 0;
      let cursor = superDescriptor;
      const seen = new Set();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        if (targets.includes(cursor)) break;
        const resolved = vm?.registry?.resolve(cursor);
        cursor = resolved?.superDescriptor || resolved?.dexClass?.superclass || null;
        depth += 1;
      }
      if (!targets.includes(cursor)) continue;
      if (depth > bestDepth) {
        bestDepth = depth;
        best = descriptor;
      }
    }
  }
  return best;
}

function generateLayoutParamsReturnType(vm, descriptor) {
  const seen = new Set();
  let desc = descriptor;
  while (desc && !seen.has(desc)) {
    seen.add(desc);
    const rc = vm.registry.resolve(desc);
    const dexClass = rc?.dexClass;
    if (dexClass?.methodsByName) {
      for (const [key, method] of dexClass.methodsByName) {
        if (!key.startsWith('generateLayoutParams(')) continue;
        const type = method?.proto?.returnType;
        if (type && type !== 'Landroid/view/ViewGroup$LayoutParams;') return type;
      }
    }
    desc = rc?.superDescriptor || null;
  }
  return null;
}

export function layoutParamsDescriptorFor(view, vm, parent = view?.parent) {
  const parentName = parent?.constructor?.name;
  const parentDescriptor = parent?.$descriptor;
  if (parentDescriptor && vm?.registry?.resolve) {
    const nested = findNestedLayoutParamsClass(vm, parentDescriptor);
    if (nested) return nested;
    const declared = generateLayoutParamsReturnType(vm, parentDescriptor);
    if (declared) return declared;
  }
  if (parentName === 'RelativeLayout') return 'Landroid/widget/RelativeLayout$LayoutParams;';
  if (parentName === 'LinearLayout') return 'Landroid/widget/LinearLayout$LayoutParams;';
  if (parentName === 'FrameLayout' || parentName === 'DecorView') return 'Landroid/widget/FrameLayout$LayoutParams;';
  if (parentName === 'AbsoluteLayout') return 'Landroid/widget/AbsoluteLayout$LayoutParams;';
  if (view?.layoutParams?.leftMargin !== undefined) return 'Landroid/view/ViewGroup$MarginLayoutParams;';
  return 'Landroid/view/ViewGroup$LayoutParams;';
}

function findDexMethod(vm, descriptor, name, protoDescriptor) {
  let desc = descriptor;
  const seen = new Set();
  while (desc && !seen.has(desc)) {
    seen.add(desc);
    const rc = vm.registry.resolve(desc);
    const method = rc?.dexClass?.findDeclaredMethod?.(name, protoDescriptor);
    if (method) return method;
    desc = rc?.superDescriptor || rc?.dexClass?.superclass || null;
  }
  return null;
}

function setLayoutParamsBaseFields(object, params) {
  const setBaseField = (name, value) => {
    for (const key of object.$fields.keys()) {
      if (key.endsWith('->' + name + ':I')) { object.$fields.set(key, value | 0); return; }
    }
    object.$fields.set('Landroid/view/ViewGroup$LayoutParams;->' + name + ':I', value | 0);
  };
  setBaseField('width', params.width | 0);
  setBaseField('height', params.height | 0);
  const hasMargins = params.leftMargin !== undefined || params.topMargin !== undefined
    || params.rightMargin !== undefined || params.bottomMargin !== undefined || params.gravity !== undefined;
  if (hasMargins) {
    const setIfPresent = (name, type, value) => {
      for (const key of object.$fields.keys()) {
        if (key.endsWith('->' + name + ':' + type)) object.$fields.set(key, value);
      }
    };
    if (params.leftMargin !== undefined) setIfPresent('leftMargin', 'I', params.leftMargin | 0);
    if (params.topMargin !== undefined) setIfPresent('topMargin', 'I', params.topMargin | 0);
    if (params.rightMargin !== undefined) setIfPresent('rightMargin', 'I', params.rightMargin | 0);
    if (params.bottomMargin !== undefined) setIfPresent('bottomMargin', 'I', params.bottomMargin | 0);
    if (typeof params.gravity === 'number') setIfPresent('gravity', 'I', params.gravity | 0);
  }
}

function buildLayoutParamsWithAttributes(vm, descriptor, contextObject, attrSet) {
  const runtimeClass = vm.registry.resolve(descriptor);
  const dexClass = runtimeClass?.dexClass;
  if (!dexClass || typeof dexClass.findDeclaredMethod !== 'function') return null;
  const ctor = dexClass.findDeclaredMethod('<init>', '(Landroid/content/Context;Landroid/util/AttributeSet;)V');
  if (!ctor) return null;
  try {
    const object = vm.instantiate(descriptor, [contextObject, attrSet]);
    return object?.$fields?.size ? object : null;
  } catch {
    return null;
  }
}

function generateLayoutParamsFromParent(vm, parent, attrSet) {
  if (!vm || !parent?.$descriptor || !attrSet) return null;
  const method = findDexMethod(
    vm,
    parent.$descriptor,
    'generateLayoutParams',
    '(Landroid/util/AttributeSet;)Landroid/view/ViewGroup$LayoutParams;'
  );
  if (!method) return null;
  try {
    const parentObject = parent.$javaObject || viewObject(vm, parent);
    const object = vm.executeMethod(method, parentObject, [attrSet]);
    return object?.$fields?.size ? object : null;
  } catch {
    return null;
  }
}

export function buildLayoutParamsViaDex(vm, descriptor, params, attrSet = null, contextObject = null) {
  try {
    const runtimeClass = vm.registry.resolve(descriptor);
    if (!runtimeClass?.dexClass) return null;
    let object = null;
    if (attrSet && contextObject) {
      object = buildLayoutParamsWithAttributes(vm, descriptor, contextObject, attrSet);
    }
    if (!object) {
      try {
        object = vm.instantiate(descriptor, [params.width | 0, params.height | 0]);
      } catch {
        object = null;
      }
    }
    if (!object || !object.$fields?.size) {
      try {
        object = vm.instantiate(descriptor, []);
      } catch {
        object = null;
      }
    }
    if (!object || !object.$fields?.size) return null;
    setLayoutParamsBaseFields(object, params);
    return object;
  } catch {
    return null;
  }
}

export function createChildLayoutParams(vm, parent, child, attrSet, contextObject, fallbackParams) {
  if (!vm || !parent || !attrSet) return null;
  const generated = generateLayoutParamsFromParent(vm, parent, attrSet);
  if (generated) {
    setLayoutParamsBaseFields(generated, fallbackParams);
    return generated;
  }
  const descriptor = layoutParamsDescriptorFor(child, vm, parent);
  if (!descriptor) return null;
  return buildLayoutParamsViaDex(vm, descriptor, fallbackParams, attrSet, contextObject);
}

export function coerceLayoutParams(params) {
  if (!params || typeof params !== 'object') return params;
  if (!params.$fields) {
    return params;
  }
  const out = { ...(params.$layoutParams || {}) };
  const axes = ['width', 'height', 'x', 'y', 'leftMargin', 'topMargin', 'rightMargin', 'bottomMargin', 'gravity', 'weight', 'startMargin', 'endMargin', 'column', 'span', 'margins'];
  for (const [key, value] of params.$fields) {
    for (const axis of axes) {
      if (key.endsWith(`->${axis}:I`) && typeof value === 'number') out[axis] = value;
      if (key.endsWith(`->${axis}:F`) && typeof value === 'number') out[axis] = value;
    }
  }
  if (params.$dexClass?.descriptor?.endsWith('MarginsLayoutParams$LayoutParams;')) {
    if (out.width === undefined) out.width = -2;
    if (out.height === undefined) out.height = -2;
  }
  if (out.width === undefined) out.width = -2;
  if (out.height === undefined) out.height = -2;
  return out;
}

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
        if (child) this.mountChild(root, child, childNode);
      }
      this.finishInflate(root);
      return root;
    }
    const view = this.inflateNode(node, root);
    if (root && attachToRoot && root instanceof ViewGroup) this.mountChild(root, view, node);
    return view;
  }

  inflateNode(node, parent, inheritedTheme = null) {
    if (!node || node.type !== 'element') return null;
    if (node.name === 'include') return this.inflateInclude(node, parent, inheritedTheme);
    const vm = this.context?.vm || this.context?.$vm || this.vm || null;
    const ownTheme = applyViewThemeOverlay(vm, node);
    const theme = ownTheme || inheritedTheme;
    try {
      const view = this.createView(node);
      if (theme?.attributes) view.$themeAttributes = theme.attributes;
      this.applyAttributes(view, node);
      if (view instanceof ViewGroup || typeof view.addView === 'function') {
        for (const childNode of node.children) {
          if (childNode.type !== 'element') continue;
          const child = this.inflateNode(childNode, view, theme);
          if (child) this.mountChild(view, child, childNode);
        }
      }
      this.finishInflate(view);
      return view;
    } finally {
      if (ownTheme) ownTheme.restore();
    }
  }

  finishInflate(view) {
    if (!view) return;
    const vm = this.context?.vm || this.context?.$vm || this.vm || null;
    const object = view.$javaObject;
    const descriptor = view.$descriptor;
    if (!vm || !object || !descriptor || typeof vm.findVirtual !== 'function') return;
    let resolved;
    try {
      resolved = vm.findVirtual(descriptor, 'onFinishInflate', '()V');
    } catch {
      return;
    }
    if (!resolved || resolved.kind !== 'dex') return;
    try {
      vm.invoke({ classDesc: descriptor, name: 'onFinishInflate', proto: resolved.method.proto }, object, [], 'virtual');
    } catch {
      // 与 Android 一致：初始化失败不应中断整棵布局的构建
    }
  }

  mountChild(parent, child, node) {
    this.applyParentLayoutParams(child, node, parent);
    parent.addView(child);
  }

  applyParentLayoutParams(child, node, parent) {
    const vm = this.context?.vm || this.context?.$vm || this.vm || null;
    if (!vm || !parent || !child || !node) return;
    try {
      const attrSet = this.buildAttributeSet(node);
      if (!attrSet) return;
      const fallbackParams = child.layoutParams || { width: -2, height: -2 };
      const object = createChildLayoutParams(
        vm,
        parent,
        child,
        attrSet,
        vm.contextObject || this.context,
        fallbackParams
      );
      if (!object) return;
      object.$layoutParams = { ...fallbackParams };
      child.$layoutParamsObject = object;
      child.$layoutParamsAttrSet = attrSet;
      const coerced = coerceLayoutParams(object);
      if (coerced) child.layoutParams = coerced;
    } catch {
      // 保留 applyAttributes 生成的通用宽高参数
    }
  }

  inflateInclude(node, parent, inheritedTheme = null) {
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
      const children = root.children.filter((c) => c.type === 'element').map((c) => this.inflateNode(c, parent, inheritedTheme));
      this.applyAttributes(children[0], node);
      return children[0] || null;
    }
    const view = this.inflateNode(root, parent, inheritedTheme);
    this.applyAttributes(view, node);
    return view;
  }

  createView(node) {
    const tag = node.name;
    if (globalThis.__DBG_CV && /DrawerLayout|AppBarLayout|CoordinatorLayout|Toolbar|TabLayout/.test(tag)) console.error('CV tag=' + tag);
    const fullName = tag.includes('.') ? tag : `android.widget.${tag}`;
    if (fullName === 'android.view.ViewStub' || fullName === 'android.widget.ViewStub') {
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
      'Landroid/widget/GridLayout;': GridLayout,
      'Landroid/widget/Toolbar;': Toolbar,
      'Landroid/widget/ScrollView;': ScrollView,
      'Landroid/widget/HorizontalScrollView;': HorizontalScrollView,
      'Landroid/widget/ListView;': ListView,
      'Landroid/widget/TextView;': TextView,
      'Landroid/widget/CheckedTextView;': TextView,
      'Landroid/widget/Button;': Button,
      'Landroid/widget/EditText;': EditText,
      'Landroid/widget/ImageView;': ImageView,
      'Landroid/widget/ProgressBar;': ProgressBar,
      'Landroid/webkit/WebView;': WebView,
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

    for (const [name, key] of [
      ['layout_column', 'column'],
      ['layout_row', 'row'],
      ['layout_columnSpan', 'columnSpan'],
      ['layout_rowSpan', 'rowSpan'],
      ['layout_columnWeight', 'columnWeight'],
      ['layout_rowWeight', 'rowWeight'],
    ]) {
      const attr = getByName(name);
      if (attr) lp[key] = Number(attr.value) || 0;
    }

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
      let resolved = resolveAttrValue(backgroundAttr, resources);
      if (typeof resolved === 'number' && resolved > 0 && resolved < 0x01000000) {
        const reference = (backgroundAttr.value && typeof backgroundAttr.value === 'object'
          ? backgroundAttr.value.reference
          : resolved) >>> 0;
        resolved = resources.resolve(reference);
      }
      if (typeof resolved === 'number') {
        view.background = { type: 'color', color: resolved >>> 0 };
      } else if (typeof resolved === 'string' && resolved.endsWith('.xml')) {
        const reference = (backgroundAttr.value && typeof backgroundAttr.value === 'object'
          ? backgroundAttr.value.reference
          : backgroundAttr.data) >>> 0;
        const drawable = resources.getDrawable(reference);
        if (drawable) view.background = drawable;
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
      const styleAttr = getByName('style');
      if (styleAttr?.value !== undefined && styleAttr.value !== null) {
        let styleId = styleAttr.value;
        if (typeof styleId === 'object' && styleId.reference !== undefined) styleId = styleId.reference;
        const key = typeof styleId === 'number' ? resources.table?.getEntry?.(styleId >>> 0)?.key : null;
        const styleName = String(styleAttr.value);
        if ((key && /horizontal/i.test(key)) || /horizontal/i.test(styleName)) {
          view.setStyleHorizontal?.(true);
        }
      }
      const indeterminateAttr = getByName('indeterminate');
      if (indeterminateAttr) view.setIndeterminate?.(indeterminateAttr.value === true || indeterminateAttr.value === 'true');
    }

    const tagAttr = getByName('tag');
    if (tagAttr) view.tag = String(tagAttr.value ?? '');
    return view;
  }
}

function resolveThemeSize(themeValue, resources, density) {
  let value = themeValue;
  for (let depth = 0; depth < 6; depth += 1) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      if (value.dimension !== undefined) return Math.round(convertDimension(value, density));
      if (value.reference !== undefined) {
        value = value.reference;
        continue;
      }
      return null;
    }
    if (typeof value === 'string') {
      const text = value.trim();
      if (text.startsWith('@') && resources?.resolveName) {
        const resolved = resources.resolveName(text);
        if (resolved !== null && resolved !== undefined && resolved !== value) {
          value = resolved;
          continue;
        }
      }
      return null;
    }
    if (typeof value !== 'number') return null;
    const numeric = value >>> 0;
    if (numeric >= 0x01000000 && numeric <= 0x7fffffff) {
      const entry = resources?.table?.getEntry?.(numeric);
      const themeAttrs = resources?.vm?.themeAttributes;
      if (entry?.key && themeAttrs && themeAttrs[entry.key] !== undefined && themeAttrs[entry.key] !== value) {
        value = themeAttrs[entry.key];
        continue;
      }
      const resolved = resources?.resolve?.(numeric);
      if (resolved !== null && resolved !== undefined && resolved !== value) {
        value = resolved;
        continue;
      }
    }
    return Math.round(value > 0 && value <= 168 ? value * density : value);
  }
  return null;
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
      const resolvedTheme = resolveThemeSize(themeValue, resources, density);
      if (resolvedTheme !== null) return resolvedTheme;
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

const VIEW_THEME_ATTR_KEYS = new Map([
  [0x01010030, 'colorForeground'],
  [0x01010031, 'colorBackground'],
  [0x01010036, 'textColorPrimary'],
  [0x01010037, 'textColorSecondary'],
  [0x01010038, 'textColorTertiary'],
  [0x01010039, 'textColorPrimaryInverse'],
  [0x0101003a, 'textColorSecondaryInverse'],
  [0x01010095, 'textSize'],
  [0x01010098, 'textColor'],
  [0x01010099, 'textColorHighlight'],
  [0x0101009a, 'textColorHint'],
  [0x0101009b, 'textColorLink'],
]);

function viewThemeStyleId(node, resources) {
  if (!node?.attrs || !resources?.table) return 0;
  const attr = node.attrs.find((a) => (a.resId >>> 0) === ATTR_IDS.theme || a.name === 'theme');
  if (!attr) return 0;
  const value = attr.value;
  if (value && typeof value === 'object' && value.reference !== undefined) return value.reference >>> 0;
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'string') {
    const match = /(?:0x([0-9a-fA-F]+)|(\d+))$/.exec(value);
    if (match) return (match[1] ? parseInt(match[1], 16) : parseInt(match[2], 10)) >>> 0;
  }
  return (attr.data >>> 0) || 0;
}

function applyViewThemeOverlay(vm, node) {
  const table = vm?.resources?.table;
  if (!vm || !table) return null;
  const styleId = viewThemeStyleId(node, vm.resources);
  if (!styleId) return null;
  const store = vm.themeAttributes || (vm.themeAttributes = {});
  const saved = { ...store };
  const savedRefs = store.$attrReferences ? { ...store.$attrReferences } : null;
  const seen = new Set();
  const apply = (id) => {
    id = id >>> 0;
    if (seen.has(id)) return;
    seen.add(id);
    const entry = table.getEntry(id);
    if (!entry) return;
    const parent = entry.bag && typeof entry.bag.parent === 'number' ? entry.bag.parent >>> 0 : 0;
    if (parent) apply(parent);
    const attributes = table.getStyleAttributes(id);
    if (!attributes || !attributes.size) return;
    for (const [attrId, rawValue] of attributes) {
      const key = table.getEntry(attrId)?.key || VIEW_THEME_ATTR_KEYS.get(attrId >>> 0);
      if (!key) continue;
      let value = rawValue;
      if (value && typeof value === 'object' && 'reference' in value) {
        store.$attrReferences ||= {};
        store.$attrReferences[key] = value.reference >>> 0;
        const resolved = table.resolve(value.reference);
        value = resolved === null || resolved === undefined ? value.reference : resolved;
      }
      store[key] = value;
    }
  };
  apply(styleId);
  const attributes = { ...store, $attrReferences: store.$attrReferences ? { ...store.$attrReferences } : undefined };
  return {
    attributes,
    restore: () => {
      for (const key of Object.keys(store)) {
        if (!(key in saved)) delete store[key];
      }
      Object.assign(store, saved);
      if (savedRefs) store.$attrReferences = savedRefs;
      else delete store.$attrReferences;
    },
  };
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
  if (fullName === 'android.widget.ViewStub' || fullName === 'android.view.ViewStub') {
    return new ViewStub(context);
  }
  const ctor = RESOLVED_CLASSES[fullName] || VIEW_CLASSES[tag];
  return ctor ? new ctor(context) : new View(context);
}
