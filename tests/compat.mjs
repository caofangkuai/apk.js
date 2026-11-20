import assert from 'node:assert/strict';
import { buildFrameworkDefinitions } from '../src/framework/registry.js';
import { Paint, Bitmap } from '../src/framework/graphics.js';
import { numberToFloatBits, floatBitsToNumber } from '../src/runtime/values.js';

const defs = buildFrameworkDefinitions({});
const defOf = (descriptor) => {
  const def = defs.find((item) => item.descriptor === descriptor);
  assert(def, `缺少宿主类 ${descriptor}`);
  return def;
};
const method = (descriptor, key) => {
  const impl = defOf(descriptor).methods.get(key);
  assert(impl, `缺少方法 ${descriptor}#${key}`);
  return impl;
};
const staticMethod = (descriptor, key) => {
  const impl = defOf(descriptor).staticMethods.get(key);
  assert(impl, `缺少静态方法 ${descriptor}#${key}`);
  return impl;
};

// View：点击委托、可见性、背景纯色
{
  let clicked = 0;
  const view = {
    performClick: () => {
      clicked++;
      return true;
    },
  };
  assert.equal(method('Landroid/view/View;', 'callOnClick()Z')({ view }, []), true);
  assert.equal(clicked, 1);

  let layout = 0;
  let invalidated = 0;
  const visibilityView = {
    visibility: 0,
    setVisibility: (value) => {
      visibilityView.visibility = value;
      layout++;
      invalidated++;
    },
  };
  method('Landroid/view/View;', 'setVisibility(I)V')({ view: visibilityView }, [8]);
  assert.equal(visibilityView.visibility, 8);
  assert.equal(layout, 1);
  assert.equal(invalidated, 1);

  const background = { color: 0xff112233, type: 'color' };
  assert.equal(method('Landroid/view/View;', 'getSolidColor()I')({ view: { background } }, []), 0xff112233);
}

// TextView：compound padding / 行间距
{
  const view = {
    compoundPadding: () => ({ left: 8, right: 4, top: 2, bottom: 6 }),
    lineSpacingExtra: 3,
    lineSpacingMultiplier: 1.2,
    text: 'abcd',
    textSize: 14,
  };
  const self = { view };
  assert.equal(method('Landroid/widget/TextView;', 'getCompoundPaddingLeft()I')(self, []), 8);
  assert.equal(method('Landroid/widget/TextView;', 'getCompoundPaddingBottom()I')(self, []), 6);
  assert.equal(method('Landroid/widget/TextView;', 'getLineSpacingExtra()F')(self, []), 3);
  assert.equal(method('Landroid/widget/TextView;', 'getLineSpacingMultiplier()F')(self, []), 1.2);
  assert.equal(method('Landroid/widget/TextView;', 'length()I')(self, []), 4);
}

// Paint：字体度量与文本边界
{
  const paint = new Paint();
  paint.setTextSize(20);
  const self = { paint };
  const metrics = { ascent: 0, descent: 0, top: 0, bottom: 0, leading: 0 };
  const vm = {
    setField: (target, field, bits) => {
      target[field.name] = floatBitsToNumber(bits);
    },
  };
  const height = method('Landroid/graphics/Paint;', 'getFontMetrics(Landroid/graphics/Paint$FontMetrics;)F')(self, [metrics], vm);
  assert(height > 20, '行高应大于字号');
  assert(metrics.ascent < 0, 'ascent 应为负值');
  assert(metrics.descent > 0, 'descent 应为正值');
  assert.equal(method('Landroid/graphics/Paint;', 'ascent()F')(self, []), Math.floor(metrics.ascent));

  const rect = { $fields: new Map() };
  method('Landroid/graphics/Paint;', 'getTextBounds(Ljava/lang/String;IILandroid/graphics/Rect;)V')(self, ['hello', 0, 5, rect]);
  const right = rect.$fields.get('Landroid/graphics/Rect;->right:I');
  const bottom = rect.$fields.get('Landroid/graphics/Rect;->bottom:I');
  const top = rect.$fields.get('Landroid/graphics/Rect;->top:I');
  assert(right > 0, '文本宽度应大于 0');
  assert(bottom > top, '文本高度应大于 0');
}

// Canvas：drawLines 按 float 位读取数组
{
  const lines = [];
  const canvas = {
    drawLine: (x1, y1, x2, y2) => lines.push([x1, y1, x2, y2]),
  };
  const bits = [0, 0, 10, 10].map((value) => numberToFloatBits(value));
  method('Landroid/graphics/Canvas;', 'drawLines([FLandroid/graphics/Paint;)V')({ canvas }, [{ $data: bits }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0][2], 10);
  assert.equal(floatBitsToNumber(bits[2]), 10);
}

// Bitmap：静态缩放
{
  const vm = { allocateRawObject: (descriptor) => ({ $nativeClass: descriptor }) };
  const source = { $peer: new Bitmap(null, 10, 10) };
  const scaled = staticMethod('Landroid/graphics/Bitmap;', 'createScaledBitmap(Landroid/graphics/Bitmap;IIZ)Landroid/graphics/Bitmap;')(null, [source, 20, 30, true], vm);
  assert.equal(scaled.$nativeClass, 'Landroid/graphics/Bitmap;');
  assert.equal(scaled.$peer.width, 20);
  assert.equal(scaled.$peer.height, 30);
}

// MotionEvent：动作与坐标
{
  const event = { action: 1 | (2 << 8), x: 5, y: 6, pointerCount: 2, eventTime: 100 };
  assert.equal(method('Landroid/view/MotionEvent;', 'getActionMasked()I')(event, []), 1);
  assert.equal(method('Landroid/view/MotionEvent;', 'getActionIndex()I')(event, []), 2);
  assert.equal(method('Landroid/view/MotionEvent;', 'getX(I)F')(event, [0]), 5);
  assert.equal(method('Landroid/view/MotionEvent;', 'getPointerCount()I')(event, []), 2);
}

// Intent：extra 读取
{
  const extras = new Map([['count', 3], ['name', 'apk']]);
  const intent = { extras };
  assert.equal(method('Landroid/content/Intent;', 'getIntExtra(Ljava/lang/String;I)I')(intent, ['count', 0]), 3);
  assert.equal(method('Landroid/content/Intent;', 'getStringExtra(Ljava/lang/String;)Ljava/lang/String;')(intent, ['name']), 'apk');
  assert.equal(method('Landroid/content/Intent;', 'getBooleanExtra(Ljava/lang/String;Z)Z')(intent, ['missing', true]), true);
  assert.equal(method('Landroid/content/Intent;', 'hasExtra(Ljava/lang/String;)Z')(intent, ['count']), true);
}

// Uri：解析、查询参数、Builder 拼接
{
  const vm = {
    allocateRawObject: (descriptor) => ({ $nativeClass: descriptor }),
    newArray: (descriptor, length) => ({ $data: new Array(length) }),
  };
  const uri = staticMethod('Landroid/net/Uri;', 'parse(Ljava/lang/String;)Landroid/net/Uri;')(null, ['https://user@example.com:8443/a/b?x=1&y=2#frag'], vm);
  const parse = (key) => method('Landroid/net/Uri;', key)(uri.$peer, [], vm);
  assert.equal(parse('getScheme()Ljava/lang/String;'), 'https');
  assert.equal(parse('getHost()Ljava/lang/String;'), 'example.com');
  assert.equal(parse('getPort()I'), 8443);
  assert.equal(parse('getUserInfo()Ljava/lang/String;'), 'user');
  assert.equal(parse('getPath()Ljava/lang/String;'), '/a/b');
  assert.equal(parse('getLastPathSegment()Ljava/lang/String;'), 'b');
  assert.equal(method('Landroid/net/Uri;', 'getQueryParameter(Ljava/lang/String;)Ljava/lang/String;')(uri.$peer, ['x']), '1');
  const segments = method('Landroid/net/Uri;', 'getPathSegments()Ljava/util/List;')(uri.$peer, [], vm);
  assert.deepEqual(segments.$peer.items, ['a', 'b']);
  const names = method('Landroid/net/Uri;', 'getQueryParameterNames()Ljava/util/Set;')(uri.$peer, [], vm);
  assert.deepEqual(names.$peer.setItems, ['x', 'y']);

  const builder = vm.allocateRawObject('Landroid/net/Uri$Builder;');
  builder.$peer = { $scheme: null, $authority: null, $userInfo: null, $host: null, $port: -1, $path: '', $query: null, $fragment: null, $opaque: false, $ssp: null, $segments: null };
  const builderMethod = (key) => method('Landroid/net/Uri$Builder;', key);
  builderMethod('scheme(Ljava/lang/String;)Landroid/net/Uri$Builder;')(builder.$peer, ['https']);
  builderMethod('authority(Ljava/lang/String;)Landroid/net/Uri$Builder;')(builder.$peer, ['api.example.com']);
  builderMethod('appendPath(Ljava/lang/String;)Landroid/net/Uri$Builder;')(builder.$peer, ['v1']);
  builderMethod('appendQueryParameter(Ljava/lang/String;Ljava/lang/String;)Landroid/net/Uri$Builder;')(builder.$peer, ['q', 'a b']);
  const built = builderMethod('build()Landroid/net/Uri;')(builder.$peer, [], vm);
  assert.equal(built.$peer.$scheme, 'https');
  assert.equal(built.$peer.$host, 'api.example.com');
  assert.equal(built.$peer.$path, '/v1');
  assert.equal(method('Landroid/net/Uri;', 'getQueryParameter(Ljava/lang/String;)Ljava/lang/String;')(built.$peer, ['q']), 'a b');
}

// URLUtil / MimeTypeMap / CookieManager
{
  const vm = {
    allocateRawObject: (descriptor) => ({ $nativeClass: descriptor }),
    newArray: (descriptor, length) => ({ $data: new Array(length) }),
  };
  assert.equal(staticMethod('Landroid/webkit/URLUtil;', 'guessUrl(Ljava/lang/String;)Ljava/lang/String;')(null, ['example.com']), 'http://example.com/');
  assert.equal(staticMethod('Landroid/webkit/URLUtil;', 'isHttpUrl(Ljava/lang/String;)Z')(null, ['http://a.com']), true);
  assert.equal(staticMethod('Landroid/webkit/URLUtil;', 'isHttpsUrl(Ljava/lang/String;)Z')(null, ['http://a.com']), false);
  assert.equal(staticMethod('Landroid/webkit/URLUtil;', 'isValidUrl(Ljava/lang/String;)Z')(null, ['not a url']), false);
  assert.equal(staticMethod('Landroid/webkit/URLUtil;', 'stripAnchor(Ljava/lang/String;)Ljava/lang/String;')(null, ['http://a.com/x#y']), 'http://a.com/x');
  assert.equal(
    staticMethod('Landroid/webkit/URLUtil;', 'guessFileName(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;')(null, ['http://a.com/files/report.pdf?x=1', null, 'application/pdf']),
    'report.pdf'
  );
  const bytes = staticMethod('Landroid/webkit/URLUtil;', 'decode(Ljava/lang/String;)[B')(null, ['abc'], vm);
  assert.deepEqual(Array.from(bytes.$data), [97, 98, 99]);

  const mime = staticMethod('Landroid/webkit/MimeTypeMap;', 'getSingleton()Landroid/webkit/MimeTypeMap;')(null, [], vm);
  assert.equal(method('Landroid/webkit/MimeTypeMap;', 'getMimeTypeFromExtension(Ljava/lang/String;)Ljava/lang/String;')(mime.$peer, ['PNG']), 'image/png');
  assert.equal(method('Landroid/webkit/MimeTypeMap;', 'getExtensionFromMimeType(Ljava/lang/String;)Ljava/lang/String;')(mime.$peer, ['application/json']), 'json');

  const cookies = staticMethod('Landroid/webkit/CookieManager;', 'getInstance()Landroid/webkit/CookieManager;')(null, [], vm);
  method('Landroid/webkit/CookieManager;', 'setCookie(Ljava/lang/String;Ljava/lang/String;)V')(cookies.$peer, ['https://a.com', 'a=1; b=2']);
  assert.equal(method('Landroid/webkit/CookieManager;', 'getCookie(Ljava/lang/String;)Ljava/lang/String;')(cookies.$peer, ['https://a.com']), 'a=1; b=2');
}

// WebSettings 读写
{
  const settings = vmPeer();
  method('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled(Z)V')(settings, [true]);
  assert.equal(method('Landroid/webkit/WebSettings;', 'getJavaScriptEnabled()Z')(settings, []), true);
  assert.equal(method('Landroid/webkit/WebSettings;', 'getAllowFileAccess()Z')(settings, []), true);
  method('Landroid/webkit/WebSettings;', 'setAllowFileAccess(Z)V')(settings, [false]);
  assert.equal(method('Landroid/webkit/WebSettings;', 'getAllowFileAccess()Z')(settings, []), false);
  assert.equal(method('Landroid/webkit/WebSettings;', 'getDefaultTextEncodingName()Ljava/lang/String;')(settings, []), 'UTF-8');
}

function vmPeer() {
  return { $peer: {}, view: { settings: {} } };
}

// WebView：客户端与设置转发
{
  const view = { settings: {}, loadUrl: () => {} };
  const self = { view };
  method('Landroid/webkit/WebView;', 'addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V')(self, [{}, 'bridge']);
  assert.equal(view.javascriptInterfaces.size, 1);
  method('Landroid/webkit/WebView;', 'removeJavascriptInterface(Ljava/lang/String;)V')(self, ['bridge']);
  assert.equal(view.javascriptInterfaces.size, 0);
  assert.equal(method('Landroid/webkit/WebView;', 'canGoBack()Z')(self, []), false);
  assert.equal(method('Landroid/webkit/WebView;', 'getProgress()I')(self, []), 100);
  method('Landroid/webkit/WebView;', 'evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V')(self, ['1+1', null]);
  assert.equal(view.lastEvaluatedScript, '1+1');
}

// View / TextView：本轮补齐的状态型 API
{
  const view = { text: 'a', invalidate() {}, setText(value) { this.text = value; } };
  const self = { view };
  method('Landroid/view/View;', 'setKeepScreenOn(Z)V')(self, [true]);
  assert.equal(view.keepScreenOn, true);
  assert.equal(method('Landroid/view/View;', 'getKeepScreenOn()Z')(self, []), true);
  method('Landroid/view/View;', 'setNextFocusDownId(I)V')(self, [7]);
  assert.equal(method('Landroid/view/View;', 'getNextFocusDownId()I')(self, []), 7);
  method('Landroid/view/View;', 'setAccessibilityPaneTitle(Ljava/lang/CharSequence;)V')(self, ['面板']);
  assert.equal(method('Landroid/view/View;', 'getAccessibilityPaneTitle()Ljava/lang/CharSequence;')(self, []), '面板');
  method('Landroid/widget/TextView;', 'setText(Ljava/lang/CharSequence;Landroid/widget/TextView$BufferType;)V')(self, ['hello']);
  assert.equal(view.text, 'hello');
  method('Landroid/widget/TextView;', 'setInputType(I)V')(self, [0x81]);
  assert.equal(method('Landroid/widget/TextView;', 'isAnyPasswordInputType()Z')(self, []), true);
  method('Landroid/widget/TextView;', 'setHint(Ljava/lang/CharSequence;)V')(self, ['提示']);
  assert.equal(method('Landroid/widget/TextView;', 'getHint()Ljava/lang/CharSequence;')(self, []), '提示');
}

// 兼容层不能覆盖已有实现
{
  const canvasDef = defOf('Landroid/graphics/Canvas;');
  assert(canvasDef.methods.has('drawRoundRect(Landroid/graphics/RectF;FFLandroid/graphics/Paint;)V'), '原有方法应保留');
}

console.log('compat validation OK');
