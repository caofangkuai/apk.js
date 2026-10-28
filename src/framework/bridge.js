import { View, ViewGroup } from './view.js';
import {
  FrameLayout,
  AbsoluteLayout,
  LinearLayout,
  RelativeLayout,
} from './layouts.js';
import {
  Button,
  EditText,
  ImageView,
  ProgressBar,
  ScrollView,
  TextView,
  WebView,
} from './widgets.js';
import { DecorView } from './window.js';

const DESCRIPTOR_BY_CLASS = new Map([
  ['View', 'Landroid/view/View;'],
  ['ViewGroup', 'Landroid/view/ViewGroup;'],
  ['LinearLayout', 'Landroid/widget/LinearLayout;'],
  ['FrameLayout', 'Landroid/widget/FrameLayout;'],
  ['RelativeLayout', 'Landroid/widget/RelativeLayout;'],
  ['AbsoluteLayout', 'Landroid/widget/AbsoluteLayout;'],
  ['TextView', 'Landroid/widget/TextView;'],
  ['Button', 'Landroid/widget/Button;'],
  ['EditText', 'Landroid/widget/EditText;'],
  ['ImageView', 'Landroid/widget/ImageView;'],
  ['ScrollView', 'Landroid/widget/ScrollView;'],
  ['ProgressBar', 'Landroid/widget/ProgressBar;'],
  ['WebView', 'Landroid/webkit/WebView;'],
  ['DecorView', 'Landroid/view/ViewGroup;'],
]);

export function descriptorOfView(view) {
  if (!view) return 'Landroid/view/View;';
  if (view.$descriptor) return view.$descriptor;
  for (const ctor of [
    Button,
    EditText,
    TextView,
    ImageView,
    ScrollView,
    ProgressBar,
    WebView,
    LinearLayout,
    FrameLayout,
    RelativeLayout,
    AbsoluteLayout,
    DecorView,
    ViewGroup,
    View,
  ]) {
    if (view instanceof ctor) return DESCRIPTOR_BY_CLASS.get(ctor.name) || 'Landroid/view/View;';
  }
  return 'Landroid/view/View;';
}

export function unwrapView(value) {
  if (!value) return null;
  if (value.$view) return value.$view;
  if (value instanceof View) return value;
  return null;
}

export function viewObject(vm, view) {
  if (!view) return null;
  if (view.$javaObject && view.$javaObject.$view === view && view.$javaObject.$peer?.view === view) return view.$javaObject;
  const descriptor = descriptorOfView(view);
  const runtimeClass = vm.registry.resolve(descriptor);
  const object = runtimeClass?.dexClass
    ? vm.allocateObject(runtimeClass)
    : vm.allocateRawObject(descriptor);
  object.$nativeClass = descriptor;
  object.$view = view;
  object.$fields.set(`${descriptor}->$view:Landroid/view/View;`, view);
  view.$javaObject = object;
  view.$vm = vm;
  vm.registry.getPeer(object, descriptor);
  return object;
}

export function contextFacade(vm) {
  if (vm.contextObject && vm.contextObject.getResources) return vm.contextObject;
  const facade = {
    vm,
    getResources: () => vm.resources,
    getAssets: () => vm.resources?.getAssets(),
    getHandler: () => vm.handler,
    getContext: () => facade,
    getApplicationContext: () => facade,
    getPackageName: () => vm.packageName,
  };
  facade.$descriptor = 'Landroid/content/Context;';
  vm.contextObject = facade;
  return facade;
}

export function defaultViewContext(vm) {
  return contextFacade(vm);
}
