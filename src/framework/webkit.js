import { jsString, nativeDef } from './java-core.js';

/**
 * WebKit / 网络工具类宿主实现。
 *
 * 浏览器类 APK（如 Via）会大量调用 Uri.parse、URLUtil、MimeTypeMap、CookieManager，
 * 这些类在 android.jar 里是公开 API，此前完全没有宿主实现，调用只会拿到空对象。
 * 这里给出纯 JS 的可用实现：解析、拼接、Cookie 存取都真正生效，网络请求本身仍不发起。
 */

const URI_DESCRIPTOR = 'Landroid/net/Uri;';
const URI_BUILDER_DESCRIPTOR = 'Landroid/net/Uri$Builder;';

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value ?? '').replace(/\+/g, ' '));
  } catch (_) {
    return String(value ?? '');
  }
}

function safeEncode(value) {
  return encodeURIComponent(String(value ?? ''));
}

function splitAuthority(authority) {
  const result = { userInfo: null, host: null, port: -1 };
  if (!authority) return result;
  const at = authority.lastIndexOf('@');
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  if (at >= 0) result.userInfo = authority.slice(0, at);
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']');
    result.host = close >= 0 ? hostPort.slice(0, close + 1) : hostPort;
    const rest = close >= 0 ? hostPort.slice(close + 1) : '';
    if (rest.startsWith(':')) result.port = Number(rest.slice(1)) || -1;
    return result;
  }
  const colon = hostPort.lastIndexOf(':');
  if (colon > 0) {
    result.host = hostPort.slice(0, colon);
    const port = Number(hostPort.slice(colon + 1));
    result.port = Number.isFinite(port) ? port : -1;
  } else {
    result.host = hostPort;
  }
  return result;
}

function parseUriParts(text) {
  const value = String(text ?? '');
  const parts = {
    $value: value,
    $scheme: null,
    $authority: null,
    $userInfo: null,
    $host: null,
    $port: -1,
    $path: '',
    $query: null,
    $fragment: null,
    $opaque: false,
    $ssp: null,
  };
  let base = value;
  const hash = base.indexOf('#');
  if (hash >= 0) {
    parts.$fragment = base.slice(hash + 1);
    base = base.slice(0, hash);
  }
  const question = base.indexOf('?');
  if (question >= 0) {
    parts.$query = base.slice(question + 1);
    base = base.slice(0, question);
  }
  const colon = base.indexOf(':');
  const scheme = colon > 0 ? base.slice(0, colon) : '';
  if (scheme && /^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(scheme)) {
    parts.$scheme = scheme;
    const rest = base.slice(colon + 1);
    if (rest.startsWith('//')) {
      const slash = rest.indexOf('/', 2);
      parts.$authority = slash >= 0 ? rest.slice(2, slash) : rest.slice(2);
      parts.$path = slash >= 0 ? rest.slice(slash) : '';
      const split = splitAuthority(parts.$authority);
      parts.$userInfo = split.userInfo;
      parts.$host = split.host;
      parts.$port = split.port;
    } else {
      parts.$opaque = true;
      parts.$ssp = rest;
      parts.$path = rest;
    }
  } else if (base.startsWith('//')) {
    const slash = base.indexOf('/', 2);
    parts.$authority = slash >= 0 ? base.slice(2, slash) : base.slice(2);
    parts.$path = slash >= 0 ? base.slice(slash) : '';
    const split = splitAuthority(parts.$authority);
    parts.$userInfo = split.userInfo;
    parts.$host = split.host;
    parts.$port = split.port;
  } else {
    parts.$path = base;
  }
  return parts;
}

function uriText(parts) {
  let out = '';
  if (parts.$scheme) out += parts.$scheme + ':';
  if (parts.$opaque) {
    out += parts.$ssp ?? parts.$path ?? '';
  } else if (parts.$authority !== null && parts.$authority !== undefined) {
    out += '//' + parts.$authority;
    out += parts.$path || '';
  } else {
    out += parts.$path ?? '';
  }
  if (parts.$query !== null && parts.$query !== undefined) out += '?' + parts.$query;
  if (parts.$fragment !== null && parts.$fragment !== undefined) out += '#' + parts.$fragment;
  return out;
}

function uriObject(vm, text) {
  const object = vm.allocateRawObject(URI_DESCRIPTOR);
  object.$peer = parseUriParts(text);
  return object;
}

function pathSegments(parts) {
  return String(parts.$path || '')
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => safeDecode(segment));
}

function queryParameterMap(parts) {
  const map = new Map();
  const query = parts.$query;
  if (!query) return map;
  for (const pair of String(query).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
    const value = eq >= 0 ? safeDecode(pair.slice(eq + 1)) : '';
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(value);
  }
  return map;
}

function stringListObject(vm, values) {
  const object = vm.allocateRawObject('Ljava/util/ArrayList;');
  object.$peer = { items: values };
  return object;
}

function stringSetObject(vm, values) {
  const object = vm.allocateRawObject('Ljava/util/LinkedHashSet;');
  object.$peer = { setItems: values };
  return object;
}

const URI_METHODS = {
  'toString()Ljava/lang/String;': (self) => uriText(self),
  'buildUpon()Landroid/net/Uri$Builder;': (self, _args, vm) => {
    const object = vm.allocateRawObject(URI_BUILDER_DESCRIPTOR);
    object.$peer = {
      $scheme: self.$scheme,
      $authority: self.$authority,
      $userInfo: self.$userInfo,
      $host: self.$host,
      $port: self.$port,
      $path: self.$path,
      $query: self.$query,
      $fragment: self.$fragment,
      $opaque: self.$opaque,
      $ssp: self.$ssp,
      $segments: pathSegments(self),
    };
    return object;
  },
  'getScheme()Ljava/lang/String;': (self) => self.$scheme ?? null,
  'getSchemeSpecificPart()Ljava/lang/String;': (self) => (self.$opaque ? self.$ssp ?? self.$path : uriText({ ...self, $scheme: null })),
  'getEncodedSchemeSpecificPart()Ljava/lang/String;': (self) => (self.$opaque ? self.$ssp ?? self.$path : uriText({ ...self, $scheme: null })),
  'getAuthority()Ljava/lang/String;': (self) => (self.$authority === null ? null : safeDecode(self.$authority)),
  'getEncodedAuthority()Ljava/lang/String;': (self) => self.$authority ?? null,
  'getUserInfo()Ljava/lang/String;': (self) => (self.$userInfo === null ? null : safeDecode(self.$userInfo)),
  'getEncodedUserInfo()Ljava/lang/String;': (self) => self.$userInfo ?? null,
  'getHost()Ljava/lang/String;': (self) => self.$host ?? null,
  'getPort()I': (self) => (Number.isFinite(self.$port) ? self.$port : -1),
  'getPath()Ljava/lang/String;': (self) => (self.$path ? safeDecode(self.$path) : (self.$path ?? null)),
  'getEncodedPath()Ljava/lang/String;': (self) => self.$path || null,
  'getQuery()Ljava/lang/String;': (self) => (self.$query === null ? null : safeDecode(self.$query)),
  'getEncodedQuery()Ljava/lang/String;': (self) => self.$query ?? null,
  'getFragment()Ljava/lang/String;': (self) => (self.$fragment === null ? null : safeDecode(self.$fragment)),
  'getEncodedFragment()Ljava/lang/String;': (self) => self.$fragment ?? null,
  'getLastPathSegment()Ljava/lang/String;': (self, _args, vm) => {
    const segments = pathSegments(self);
    return segments.length ? segments[segments.length - 1] : null;
  },
  'getPathSegments()Ljava/util/List;': (self, _args, vm) => stringListObject(vm, pathSegments(self)),
  'getQueryParameter(Ljava/lang/String;)Ljava/lang/String;': (self, [name]) => {
    const values = queryParameterMap(self).get(safeDecode(name));
    return values && values.length ? values[0] : null;
  },
  'getQueryParameterNames()Ljava/util/Set;': (self, _args, vm) => stringSetObject(vm, Array.from(queryParameterMap(self).keys())),
  'getQueryParameters(Ljava/lang/String;)Ljava/util/List;': (self, [name], vm) => stringListObject(vm, queryParameterMap(self).get(safeDecode(name)) || []),
  'isHierarchical()Z': (self) => !self.$opaque,
  'isOpaque()Z': (self) => !!self.$opaque,
  'isRelative()Z': (self) => !self.$scheme,
  'isAbsolute()Z': (self) => !!self.$scheme,
  'normalizeScheme()Landroid/net/Uri;': (self) => self,
  'equals(Ljava/lang/Object;)Z': (self, [other]) => {
    const otherPeer = other?.$peer || other;
    if (!otherPeer || typeof otherPeer !== 'object') return false;
    return String(self.$value ?? uriText(self)) === String(otherPeer.$value ?? uriText(otherPeer));
  },
  'hashCode()I': (self) => {
    const text = String(self.$value ?? uriText(self));
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return hash;
  },
  'compareTo(Landroid/net/Uri;)I': (self, [other]) => {
    const a = String(self.$value ?? uriText(self));
    const b = String(other?.$peer?.$value ?? '');
    return a < b ? -1 : a > b ? 1 : 0;
  },
};

const URI_STATIC_METHODS = {
  'parse(Ljava/lang/String;)Landroid/net/Uri;': (_self, [text], vm) => (text === null || text === undefined ? null : uriObject(vm, jsString(text))),
  'fromParts(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Landroid/net/Uri;': (_self, [scheme, ssp, fragment], vm) => {
    let text = '';
    if (scheme !== null && scheme !== undefined) text += jsString(scheme) + ':';
    text += jsString(ssp);
    if (fragment !== null && fragment !== undefined) text += '#' + jsString(fragment);
    return uriObject(vm, text);
  },
  'fromFile(Ljava/io/File;)Landroid/net/Uri;': (_self, [file], vm) => {
    const path = file?.$peer?.path || jsString(file);
    return uriObject(vm, 'file://' + path);
  },
  'withAppendedPath(Landroid/net/Uri;Ljava/lang/String;)Landroid/net/Uri;': (_self, [uri, segment], vm) => {
    const base = String(uri?.$peer?.$value ?? uri?.$value ?? '');
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return uriObject(vm, trimmed + '/' + jsString(segment));
  },
  'encode(Ljava/lang/String;)Ljava/lang/String;': (_self, [text]) => safeEncode(jsString(text)),
  'encode(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [text]) => safeEncode(jsString(text)),
  'decode(Ljava/lang/String;)Ljava/lang/String;': (_self, [text]) => safeDecode(jsString(text)),
  'decode(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [text]) => safeDecode(jsString(text)),
};

const URI_BUILDER_METHODS = {
  'scheme(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$scheme = value === null || value === undefined ? null : jsString(value);
    self.$opaque = false;
    return self;
  },
  'opaquePart(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$opaque = true;
    self.$ssp = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'encodedOpaquePart(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$opaque = true;
    self.$ssp = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'authority(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$authority = value === null || value === undefined ? null : jsString(value);
    const split = splitAuthority(self.$authority);
    self.$userInfo = split.userInfo;
    self.$host = split.host;
    self.$port = split.port;
    return self;
  },
  'encodedAuthority(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$authority = value === null || value === undefined ? null : jsString(value);
    const split = splitAuthority(self.$authority);
    self.$userInfo = split.userInfo;
    self.$host = split.host;
    self.$port = split.port;
    return self;
  },
  'userInfo(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$userInfo = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'encodedUserInfo(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$userInfo = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'host(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$host = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'port(I)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$port = value | 0;
    return self;
  },
  'path(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$path = value === null || value === undefined ? '' : jsString(value);
    self.$segments = null;
    return self;
  },
  'encodedPath(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$path = value === null || value === undefined ? '' : jsString(value);
    self.$segments = null;
    return self;
  },
  'pathSegment(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    const segment = jsString(value);
    if (self.$segments) self.$segments.push(segment);
    else self.$segments = (self.$path ? String(self.$path).split('/').filter(Boolean).map(safeDecode) : []).concat(segment);
    return self;
  },
  'appendPath(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    const segment = jsString(value);
    self.$segments = (self.$segments || []).concat(segment);
    return self;
  },
  'appendEncodedPath(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    const segment = jsString(value);
    self.$segments = (self.$segments || []).concat(segment);
    return self;
  },
  'query(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$query = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'encodedQuery(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$query = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'appendQueryParameter(Ljava/lang/String;Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [name, value]) => {
    const pair = `${safeEncode(name)}=${safeEncode(value)}`;
    self.$query = self.$query ? `${self.$query}&${pair}` : pair;
    return self;
  },
  'clearQuery()Landroid/net/Uri$Builder;': (self) => {
    self.$query = null;
    return self;
  },
  'fragment(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$fragment = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'encodedFragment(Ljava/lang/String;)Landroid/net/Uri$Builder;': (self, [value]) => {
    self.$fragment = value === null || value === undefined ? null : jsString(value);
    return self;
  },
  'build()Landroid/net/Uri;': (self, _args, vm) => {
    const authority = self.$authority !== null && self.$authority !== undefined
      ? self.$authority
      : [self.$userInfo, self.$host, self.$port >= 0 ? `:${self.$port}` : '']
        .filter((part) => part !== null && part !== undefined && part !== '')
        .join('')
        .replace(/^(.+)(:\d+)$/, '$1$2');
    const path = self.$segments && self.$segments.length
      ? '/' + self.$segments.map(safeEncode).join('/')
      : (self.$path || '');
    const parts = {
      $scheme: self.$scheme,
      $authority: self.$scheme && !self.$opaque ? authority || null : authority || null,
      $path: path,
      $query: self.$query,
      $fragment: self.$fragment,
      $opaque: !!self.$opaque,
      $ssp: self.$ssp,
    };
    const text = uriText(parts);
    return uriObject(vm, text);
  },
  'toString()Ljava/lang/String;': (self) => {
    if (self.$segments && self.$segments.length) {
      const path = '/' + self.$segments.map(safeEncode).join('/');
      return uriText({ ...self, $path: path });
    }
    return uriText(self);
  },
};

function guessFileNameFromUrl(url, mimeType) {
  let name = '';
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    name = segments.length ? safeDecode(segments[segments.length - 1]) : '';
  } catch (_) {
    const cleaned = String(url ?? '').split('?')[0].split('#')[0];
    const segments = cleaned.split('/').filter(Boolean);
    name = segments.length ? safeDecode(segments[segments.length - 1]) : '';
  }
  if (name) return name;
  const extension = MIME_TO_EXTENSION.get(String(mimeType ?? '').toLowerCase()) || 'bin';
  return `downloadfile.${extension}`;
}

const URL_UTIL_STATIC_METHODS = {
  'isAssetUrl(Ljava/lang/String;)Z': (_self, [url]) => /^file:\/\/\/android_asset\//.test(jsString(url)),
  'isAboutUrl(Ljava/lang/String;)Z': (_self, [url]) => /^about:/.test(jsString(url)),
  'isContentUrl(Ljava/lang/String;)Z': (_self, [url]) => /^content:/.test(jsString(url)),
  'isDataUrl(Ljava/lang/String;)Z': (_self, [url]) => /^data:/.test(jsString(url)),
  'isFileUrl(Ljava/lang/String;)Z': (_self, [url]) => /^file:/.test(jsString(url)),
  'isJavaScriptUrl(Ljava/lang/String;)Z': (_self, [url]) => /^javascript:/.test(jsString(url)),
  'isNetworkUrl(Ljava/lang/String;)Z': (_self, [url]) => {
    const text = jsString(url).trim();
    if (!/^(https?|ftp):\/\//.test(text)) return false;
    try {
      return !!new URL(text).host;
    } catch (_) {
      return false;
    }
  },
  'isHttpUrl(Ljava/lang/String;)Z': (_self, [url]) => /^http:\/\//.test(jsString(url)),
  'isHttpsUrl(Ljava/lang/String;)Z': (_self, [url]) => /^https:\/\//.test(jsString(url)),
  'isValidUrl(Ljava/lang/String;)Z': (_self, [url]) => {
    const text = jsString(url).trim();
    if (!text) return false;
    if (/^(about|data|javascript|file|content):/.test(text)) return true;
    try {
      return !!new URL(text).host;
    } catch (_) {
      return false;
    }
  },
  'stripAnchor(Ljava/lang/String;)Ljava/lang/String;': (_self, [url]) => {
    const text = jsString(url);
    const hash = text.indexOf('#');
    return hash >= 0 ? text.slice(0, hash) : text;
  },
  'guessUrl(Ljava/lang/String;)Ljava/lang/String;': (_self, [url]) => {
    let text = jsString(url).trim();
    if (!text) return text;
    if (/^(about|data|javascript|file|content):/.test(text)) return text;
    if (text.endsWith('.')) text = text.slice(0, -1);
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) text = 'http://' + text;
    try {
      return new URL(text).toString();
    } catch (_) {
      return text;
    }
  },
  'composeSearchUrl(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [query, template, placeholder]) => {
    const needle = jsString(placeholder) || '%s';
    return jsString(template).replace(needle, safeEncode(jsString(query)));
  },
  'guessFileName(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [url, contentDisposition, mimeType]) => {
    const disposition = jsString(contentDisposition || '');
    const encoded = /filename\*\s*=\s*([^;]+)/i.exec(disposition);
    if (encoded) {
      const value = encoded[1].trim().replace(/^["']|["']$/g, '');
      const parts = value.split("''");
      return safeDecode(parts.length > 1 ? parts.slice(1).join("''") : value);
    }
    const plain = /filename\s*=\s*([^;]+)/i.exec(disposition);
    if (plain) return plain[1].trim().replace(/^["']|["']$/g, '');
    return guessFileNameFromUrl(jsString(url), mimeType);
  },
  'decode(Ljava/lang/String;)[B': (_self, [text], vm) => {
    const bytes = Array.from(new TextEncoder().encode(jsString(text)));
    const array = vm.newArray('[B', bytes.length, null);
    bytes.forEach((value, index) => { array.$data[index] = value; });
    return array;
  },
};

const MIME_MAP = new Map([
  ['html', 'text/html'],
  ['htm', 'text/html'],
  ['txt', 'text/plain'],
  ['css', 'text/css'],
  ['js', 'application/javascript'],
  ['json', 'application/json'],
  ['xml', 'text/xml'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg+xml'],
  ['ico', 'image/x-icon'],
  ['bmp', 'image/bmp'],
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['ogg', 'audio/ogg'],
  ['m4a', 'audio/mp4'],
  ['mp4', 'video/mp4'],
  ['webm', 'video/webm'],
  ['mkv', 'video/x-matroska'],
  ['pdf', 'application/pdf'],
  ['zip', 'application/zip'],
  ['gz', 'application/gzip'],
  ['apk', 'application/vnd.android.package-archive'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['otf', 'font/otf'],
  ['wasm', 'application/wasm'],
]);

const MIME_TO_EXTENSION = new Map();
for (const [extension, mime] of MIME_MAP) {
  if (!MIME_TO_EXTENSION.has(mime)) MIME_TO_EXTENSION.set(mime, extension);
}

const MIME_TYPE_MAP_METHODS = {
  'getMimeTypeFromExtension(Ljava/lang/String;)Ljava/lang/String;': (_self, [extension]) =>
    MIME_MAP.get(String(jsString(extension)).toLowerCase()) || null,
  'getExtensionFromMimeType(Ljava/lang/String;)Ljava/lang/String;': (_self, [mime]) =>
    MIME_TO_EXTENSION.get(String(jsString(mime)).toLowerCase()) || null,
  'hasExtension(Ljava/lang/String;)Z': (_self, [extension]) => MIME_MAP.has(String(jsString(extension)).toLowerCase()),
  'hasMimeType(Ljava/lang/String;)Z': (_self, [mime]) => MIME_TO_EXTENSION.has(String(jsString(mime)).toLowerCase()),
};

const MIME_TYPE_MAP_STATIC_METHODS = {
  'getSingleton()Landroid/webkit/MimeTypeMap;': (_self, _args, vm) => {
    if (!vm.$mimeTypeMap) {
      const object = vm.allocateRawObject('Landroid/webkit/MimeTypeMap;');
      object.$peer = { map: MIME_MAP };
      vm.$mimeTypeMap = object;
    }
    return vm.$mimeTypeMap;
  },
  'getFileExtensionFromUrl(Ljava/lang/String;)Ljava/lang/String;': (_self, [url]) => {
    const text = String(jsString(url)).split('?')[0].split('#')[0];
    const match = /\.([a-zA-Z0-9]+)$/.exec(text);
    return match ? match[1].toLowerCase() : '';
  },
};

function cookieStore(vm) {
  if (!vm.$cookieManager) {
    const object = vm.allocateRawObject('Landroid/webkit/CookieManager;');
    object.$peer = { cookies: new Map(), accept: true, thirdParty: new Map() };
    vm.$cookieManager = object;
  }
  return vm.$cookieManager;
}

function parseCookiePairs(text) {
  const pairs = new Map();
  for (const chunk of String(text ?? '').split(';')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) pairs.set(trimmed, '');
    else pairs.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return pairs;
}

const COOKIE_MANAGER_METHODS = {
  'setAcceptCookie(Z)V': (self, [value]) => {
    if (self.cookies) self.accept = !!value;
  },
  'acceptCookie()Z': (self) => (self.cookies ? !!self.accept : true),
  'setAcceptThirdPartyCookies(Landroid/webkit/WebView;Z)V': (self, [_view, value]) => {
    if (self.cookies) self.acceptThirdParty = !!value;
  },
  'acceptThirdPartyCookies(Landroid/webkit/WebView;)Z': (self) => (self.cookies ? !!self.acceptThirdParty : false),
  'setCookie(Ljava/lang/String;Ljava/lang/String;)V': (self, [url, cookie]) => {
    if (!self.cookies) return;
    const key = String(jsString(url));
    const existing = self.cookies.get(key) || new Map();
    for (const [name, value] of parseCookiePairs(jsString(cookie))) existing.set(name, value);
    self.cookies.set(key, existing);
  },
  'setCookie(Ljava/lang/String;Ljava/lang/String;Landroid/webkit/ValueCallback;)V': (self, [url, cookie, callback], vm) => {
    COOKIE_MANAGER_METHODS['setCookie(Ljava/lang/String;Ljava/lang/String;)V'](self, [url, cookie]);
    if (callback) {
      try { vm.invokeByName('onReceiveValue', '(Ljava/lang/Object;)V', callback, [true]); } catch (_) { /* 回调失败不影响主流程 */ }
    }
  },
  'getCookie(Ljava/lang/String;)Ljava/lang/String;': (self, [url]) => {
    if (!self.cookies) return null;
    const exact = self.cookies.get(String(jsString(url)));
    if (!exact) return null;
    return Array.from(exact.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
  },
  'getCookie(Landroid/webkit/WebView;Ljava/lang/String;)Ljava/lang/String;': (self, [url]) =>
    COOKIE_MANAGER_METHODS['getCookie(Ljava/lang/String;)Ljava/lang/String;'](self, [url]),
  'removeAllCookies(Landroid/webkit/ValueCallback;)V': (self, [_callback], vm) => {
    if (self.cookies) self.cookies.clear();
    if (_callback) {
      try { vm.invokeByName('onReceiveValue', '(Ljava/lang/Object;)V', _callback, [true]); } catch (_) { /* ignore */ }
    }
  },
  'removeSessionCookies(Landroid/webkit/ValueCallback;)V': (self, [callback], vm) => {
    if (self.cookies) self.cookies.clear();
    if (callback) {
      try { vm.invokeByName('onReceiveValue', '(Ljava/lang/Object;)V', callback, [true]); } catch (_) { /* ignore */ }
    }
  },
  'removeAllCookies()V': (self) => {
    if (self.cookies) self.cookies.clear();
  },
  'removeSessionCookies()V': (self) => {
    if (self.cookies) self.cookies.clear();
  },
  'flush()V': () => undefined,
};

const WEB_HISTORY_ITEM_METHODS = {
  'getUrl()Ljava/lang/String;': (self) => self.$url ?? null,
  'getOriginalUrl()Ljava/lang/String;': (self) => self.$url ?? null,
  'getTitle()Ljava/lang/String;': (self) => self.$title ?? null,
  'getFavicon()Landroid/graphics/Bitmap;': () => null,
  'getLastVisitedTime()J': (self) => Number(self.$time) || 0,
};

const WEB_BACK_FORWARD_LIST_METHODS = {
  'getCurrentIndex()I': (self) => (self.$items?.length ? self.$index : -1),
  'getCurrentItem()Landroid/webkit/WebHistoryItem;': (self) => (self.$items?.length ? self.$items[self.$index] ?? null : null),
  'getItemAtIndex(I)Landroid/webkit/WebHistoryItem;': (self, [index]) => self.$items?.[index | 0] ?? null,
  'getSize()I': (self) => self.$items?.length ?? 0,
  'clone()Landroid/webkit/WebBackForwardList;': (self, _args, vm) => {
    const object = vm.allocateRawObject('Landroid/webkit/WebBackForwardList;');
    object.$peer = { items: [...(self.$items || [])], index: self.$index ?? -1 };
    return object;
  },
};

const WEB_RESOURCE_REQUEST_METHODS = {
  'getUrl()Landroid/net/Uri;': (self, _args, vm) => (self.$url ? uriObject(vm, self.$url) : null),
  'isForMainFrame()Z': (self) => !!self.$mainFrame,
  'isRedirect()Z': (self) => !!self.$redirect,
  'hasGesture()Z': (self) => !!self.$gesture,
  'getMethod()Ljava/lang/String;': (self) => self.$method ?? 'GET',
  'getRequestHeaders()Ljava/util/Map;': (self, _args, vm) => {
    const object = vm.allocateRawObject('Ljava/util/HashMap;');
    object.$peer = { map: new Map(Object.entries(self.$headers || {})) };
    return object;
  },
};

const WEB_RESOURCE_ERROR_METHODS = {
  'getErrorCode()I': (self) => self.$code | 0,
  'getDescription()Ljava/lang/CharSequence;': (self) => self.$description ?? '',
};

const JS_RESULT_METHODS = {
  'cancel()V': (self) => { self.$confirmed = false; self.$done = true; },
  'confirm()V': (self) => { self.$confirmed = true; self.$done = true; },
};

const JS_PROMPT_RESULT_METHODS = {
  ...JS_RESULT_METHODS,
  'getString()Ljava/lang/String;': (self) => self.$text ?? '',
};

const SSL_ERROR_HANDLER_METHODS = {
  'proceed()V': () => undefined,
  'cancel()V': () => undefined,
};

const HTTP_AUTH_HANDLER_METHODS = {
  'proceed(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
  'cancel()V': () => undefined,
  'useHttpAuthUsernamePassword()Z': () => false,
};

const CLIENT_CERT_REQUEST_METHODS = {
  'proceed(Ljava/security/PrivateKey;[Ljava/security/cert/X509Certificate;)V': () => undefined,
  'cancel()V': () => undefined,
  'ignore()V': () => undefined,
  'getHost()Ljava/lang/String;': (self) => self.$host ?? '',
  'getPort()I': (self) => self.$port | 0,
  'getKeyTypes()[Ljava/lang/String;': () => null,
  'getPrincipals()[Ljava/security/Principal;': () => null,
};

const PERMISSION_REQUEST_METHODS = {
  'grant([Ljava/lang/String;)V': (self) => { self.$granted = true; },
  'deny()V': (self) => { self.$granted = false; },
  'getOrigin()Landroid/net/Uri;': (self, _args, vm) => (self.$origin ? uriObject(vm, self.$origin) : null),
  'getResources()Ljava/lang/String;': (self) => self.$resources ?? '',
};

const GEOLOCATION_CALLBACK_METHODS = {
  'invoke(Ljava/lang/String;ZZ)V': () => undefined,
};

const HIT_TEST_RESULT_METHODS = {
  'getType()I': (self) => self.$type | 0,
  'getExtra()Ljava/lang/String;': (self) => self.$extra ?? null,
};

const FILE_CHOOSER_PARAMS_METHODS = {
  'getMode()I': (self) => self.$mode | 0,
  'getAcceptTypes()[Ljava/lang/String;': (self) => self.$acceptTypes ?? null,
  'isCaptureEnabled()Z': (self) => !!self.$capture,
  'getTitle()Ljava/lang/CharSequence;': (self) => self.$title ?? null,
  'getFilenameHint()Ljava/lang/String;': (self) => self.$filenameHint ?? null,
  'createIntent()Landroid/content/Intent;': () => null,
};

const WEB_VIEW_TRANSPORT_METHODS = {
  'setWebView(Landroid/webkit/WebView;)V': (self, [view]) => { self.$webView = view ?? null; },
  'getWebView()Landroid/webkit/WebView;': (self) => self.$webView ?? null,
};

function webStorageObject(vm) {
  if (!vm.$webStorage) {
    const object = vm.allocateRawObject('Landroid/webkit/WebStorage;');
    object.$peer = { origins: new Map() };
    vm.$webStorage = object;
  }
  return vm.$webStorage;
}

const WEB_STORAGE_METHODS = {
  'getOriginQuota(Ljava/lang/String;)J': () => 0,
  'getOriginUsage(Ljava/lang/String;)J': () => 0,
  'getOrigins(Landroid/webkit/ValueCallback;)V': (_self, [callback], vm) => {
    if (callback) {
      const object = vm.allocateRawObject('Ljava/util/HashSet;');
      object.$peer = { setItems: [] };
      try { vm.invokeByName('onReceiveValue', '(Ljava/lang/Object;)V', callback, [object]); } catch (_) { /* ignore */ }
    }
  },
  'deleteOrigin(Ljava/lang/String;)V': () => undefined,
  'deleteAllData()V': () => undefined,
  'setQuotaForOrigin(Ljava/lang/String;J)V': () => undefined,
};

const WEB_MESSAGE_METHODS = {
  '<init>(Ljava/lang/String;)V': (self, [data]) => {
    self.$data = jsString(data);
    self.$ports = [];
  },
  '<init>(Ljava/lang/String;[Landroid/webkit/WebMessagePort;)V': (self, [data, ports]) => {
    self.$data = jsString(data);
    self.$ports = ports?.$data ? [...ports.$data] : [];
  },
  'getData()Ljava/lang/String;': (self) => self.$data ?? null,
  'getPorts()[Landroid/webkit/WebMessagePort;': (self, _args, vm) => {
    const ports = self.$ports || [];
    return vm.newArray('[Landroid/webkit/WebMessagePort;', ports.length, [...ports]);
  },
};

function webMessagePortPeer() {
  return {
    closed: false,
    queue: [],
    callback: null,
    callbackHandler: null,
    peer: null,
    owner: null,
  };
}

/** 创建一对互相连通的消息端口（createWebMessageChannel 的宿主实现）。 */
export function createWebMessagePortPair(vm) {
  const first = vm.allocateRawObject('Landroid/webkit/WebMessagePort;');
  const second = vm.allocateRawObject('Landroid/webkit/WebMessagePort;');
  first.$peer = { ...webMessagePortPeer(), owner: first };
  second.$peer = { ...webMessagePortPeer(), owner: second };
  first.$peer.peer = second.$peer;
  second.$peer.peer = first.$peer;
  return [first, second];
}

/** 把消息投递到端口，并在注册了回调时触发 onMessage。 */
function deliverWebMessage(vm, portPeer, message) {
  if (!portPeer || portPeer.closed) return;
  portPeer.queue.push(message);
  if (!portPeer.callback) return;
  try {
    vm.invokeByName(
      'onMessage',
      '(Landroid/webkit/WebMessagePort;Landroid/webkit/WebMessage;)V',
      portPeer.callback,
      [portPeer.owner, message]
    );
  } catch (_error) {
    void _error;
  }
}

const WEB_MESSAGE_PORT_METHODS = {
  '<init>()V': (self) => {
    self.closed = false;
    self.queue = [];
    self.callback = null;
    self.callbackHandler = null;
    self.peer = null;
  },
  'postMessage(Landroid/webkit/WebMessage;)V': (self, [message], vm) => {
    if (self.closed || !message) return;
    deliverWebMessage(vm, self.peer, message);
  },
  'close()V': (self) => {
    self.closed = true;
    if (self.peer) self.peer.closed = true;
  },
  'setWebMessageCallback(Landroid/webkit/WebMessagePort$WebMessageCallback;)V': (self, [callback]) => {
    self.callback = callback ?? null;
  },
  'setWebMessageCallback(Landroid/webkit/WebMessagePort$WebMessageCallback;Landroid/os/Handler;)V': (self, [callback, handler]) => {
    self.callback = callback ?? null;
    self.callbackHandler = handler ?? null;
  },
};

const WEB_MESSAGE_CALLBACK_METHODS = {
  '<init>()V': () => undefined,
  'onMessage(Landroid/webkit/WebMessagePort;Landroid/webkit/WebMessage;)V': () => undefined,
};

const PLUGIN_METHODS = {
  '<init>(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V': (self, [name, path, fileName, description]) => {
    self.name = jsString(name) ?? '';
    self.path = jsString(path) ?? '';
    self.fileName = jsString(fileName) ?? '';
    self.description = jsString(description) ?? '';
  },
  'getName()Ljava/lang/String;': (self) => self.name ?? '',
  'getPath()Ljava/lang/String;': (self) => self.path ?? '',
  'getFileName()Ljava/lang/String;': (self) => self.fileName ?? '',
  'getDescription()Ljava/lang/String;': (self) => self.description ?? '',
  'setName(Ljava/lang/String;)V': (self, [value]) => { self.name = jsString(value) ?? ''; },
  'setPath(Ljava/lang/String;)V': (self, [value]) => { self.path = jsString(value) ?? ''; },
  'setFileName(Ljava/lang/String;)V': (self, [value]) => { self.fileName = jsString(value) ?? ''; },
  'setDescription(Ljava/lang/String;)V': (self, [value]) => { self.description = jsString(value) ?? ''; },
  'setClickHandler(Landroid/webkit/Plugin$PreferencesClickHandler;)V': (self, [handler]) => {
    self.clickHandler = handler ?? null;
  },
  'dispatchClickEvent(Landroid/content/Context;)V': (self, [context], vm) => {
    self.clicked = true;
    if (self.clickHandler) {
      try {
        vm.invokeByName('handleClickEvent', '(Landroid/webkit/Plugin;)V', self.clickHandler, [self.owner ?? self]);
      } catch (_error) {
        void _error;
      }
    }
  },
  'toString()Ljava/lang/String;': (self) => self.name ?? '',
};

const PLUGIN_LIST_METHODS = {
  '<init>()V': (self) => { self.plugins = []; },
  'getList()Ljava/util/List;': (self, _args, vm) => {
    const object = vm.allocateRawObject('Ljava/util/ArrayList;');
    object.$peer = { items: [...(self.plugins || [])] };
    return object;
  },
  'addPlugin(Landroid/webkit/Plugin;)V': (self, [plugin]) => {
    if (plugin) (self.plugins ||= []).push(plugin);
  },
  'removePlugin(Landroid/webkit/Plugin;)V': (self, [plugin]) => {
    const plugins = (self.plugins ||= []);
    const index = plugins.indexOf(plugin);
    if (index >= 0) plugins.splice(index, 1);
  },
  'clear()V': (self) => { self.plugins = []; },
  'pluginClicked(Landroid/content/Context;I)V': (self, [context, index], vm) => {
    const plugin = (self.plugins || [])[index | 0];
    if (!plugin) return;
    try {
      vm.invokeByName('dispatchClickEvent', '(Landroid/content/Context;)V', plugin, [context]);
    } catch (_error) {
      void _error;
    }
  },
};

export const WEBKIT_CLASSES = {
  'Landroid/net/Uri;': nativeDef(URI_DESCRIPTOR, {
    super: 'Ljava/lang/Object;',
    methods: URI_METHODS,
    staticMethods: URI_STATIC_METHODS,
  }),
  'Landroid/net/Uri$Builder;': nativeDef(URI_BUILDER_DESCRIPTOR, {
    super: 'Ljava/lang/Object;',
    ctor: class UriBuilderPeer {
      constructor() {
        this.$scheme = null;
        this.$authority = null;
        this.$userInfo = null;
        this.$host = null;
        this.$port = -1;
        this.$path = '';
        this.$query = null;
        this.$fragment = null;
        this.$opaque = false;
        this.$ssp = null;
        this.$segments = null;
      }
    },
    methods: {
      '<init>()V': (self) => {
        self.$scheme = null;
        self.$authority = null;
        self.$userInfo = null;
        self.$host = null;
        self.$port = -1;
        self.$path = '';
        self.$query = null;
        self.$fragment = null;
        self.$opaque = false;
        self.$ssp = null;
        self.$segments = null;
      },
      ...URI_BUILDER_METHODS,
    },
  }),
  'Landroid/webkit/URLUtil;': nativeDef('Landroid/webkit/URLUtil;', {
    super: 'Ljava/lang/Object;',
    staticMethods: URL_UTIL_STATIC_METHODS,
  }),
  'Landroid/webkit/MimeTypeMap;': nativeDef('Landroid/webkit/MimeTypeMap;', {
    super: 'Ljava/lang/Object;',
    ctor: class MimeTypeMapPeer {
      constructor() {
        this.map = MIME_MAP;
      }
    },
    methods: MIME_TYPE_MAP_METHODS,
    staticMethods: MIME_TYPE_MAP_STATIC_METHODS,
  }),
  'Landroid/webkit/CookieManager;': nativeDef('Landroid/webkit/CookieManager;', {
    super: 'Ljava/lang/Object;',
    methods: COOKIE_MANAGER_METHODS,
    staticMethods: {
      'getInstance()Landroid/webkit/CookieManager;': (_self, _args, vm) => cookieStore(vm),
    },
  }),
  'Landroid/webkit/WebMessage;': nativeDef('Landroid/webkit/WebMessage;', {
    super: 'Ljava/lang/Object;',
    methods: WEB_MESSAGE_METHODS,
  }),
  'Landroid/webkit/WebMessagePort;': nativeDef('Landroid/webkit/WebMessagePort;', {
    super: 'Ljava/lang/Object;',
    methods: WEB_MESSAGE_PORT_METHODS,
  }),
  'Landroid/webkit/WebMessagePort$WebMessageCallback;': nativeDef('Landroid/webkit/WebMessagePort$WebMessageCallback;', {
    super: 'Ljava/lang/Object;',
    methods: WEB_MESSAGE_CALLBACK_METHODS,
  }),
  'Landroid/webkit/Plugin;': nativeDef('Landroid/webkit/Plugin;', {
    super: 'Ljava/lang/Object;',
    methods: PLUGIN_METHODS,
  }),
  'Landroid/webkit/PluginList;': nativeDef('Landroid/webkit/PluginList;', {
    super: 'Ljava/lang/Object;',
    methods: PLUGIN_LIST_METHODS,
  }),
  'Landroid/webkit/WebStorage;': nativeDef('Landroid/webkit/WebStorage;', {
    super: 'Ljava/lang/Object;',
    methods: WEB_STORAGE_METHODS,
    staticMethods: {
      'getInstance()Landroid/webkit/WebStorage;': (_self, _args, vm) => webStorageObject(vm),
    },
  }),
  'Landroid/webkit/WebHistoryItem;': nativeDef('Landroid/webkit/WebHistoryItem;', {
    super: 'Ljava/lang/Object;',
    ctor: class WebHistoryItemPeer {
      constructor() {
        this.$url = '';
        this.$title = '';
        this.$time = 0;
      }
    },
    methods: WEB_HISTORY_ITEM_METHODS,
  }),
  'Landroid/webkit/WebBackForwardList;': nativeDef('Landroid/webkit/WebBackForwardList;', {
    super: 'Ljava/lang/Object;',
    ctor: class WebBackForwardListPeer {
      constructor() {
        this.$items = [];
        this.$index = -1;
      }
    },
    methods: WEB_BACK_FORWARD_LIST_METHODS,
  }),
  'Landroid/webkit/WebResourceRequest;': nativeDef('Landroid/webkit/WebResourceRequest;', {
    super: 'Ljava/lang/Object;',
    methods: WEB_RESOURCE_REQUEST_METHODS,
  }),
  'Landroid/webkit/WebResourceError;': nativeDef('Landroid/webkit/WebResourceError;', {
    super: 'Ljava/lang/Object;',
    methods: WEB_RESOURCE_ERROR_METHODS,
  }),
  'Landroid/webkit/JsResult;': nativeDef('Landroid/webkit/JsResult;', {
    super: 'Ljava/lang/Object;',
    ctor: class JsResultPeer {
      constructor() {
        this.$confirmed = false;
        this.$done = false;
      }
    },
    methods: JS_RESULT_METHODS,
  }),
  'Landroid/webkit/JsPromptResult;': nativeDef('Landroid/webkit/JsPromptResult;', {
    super: 'Landroid/webkit/JsResult;',
    ctor: class JsPromptResultPeer {
      constructor() {
        this.$confirmed = false;
        this.$done = false;
        this.$text = '';
      }
    },
    methods: JS_PROMPT_RESULT_METHODS,
  }),
  'Landroid/webkit/SslErrorHandler;': nativeDef('Landroid/webkit/SslErrorHandler;', {
    super: 'Ljava/lang/Object;',
    methods: SSL_ERROR_HANDLER_METHODS,
  }),
  'Landroid/webkit/HttpAuthHandler;': nativeDef('Landroid/webkit/HttpAuthHandler;', {
    super: 'Ljava/lang/Object;',
    methods: HTTP_AUTH_HANDLER_METHODS,
  }),
  'Landroid/webkit/ClientCertRequest;': nativeDef('Landroid/webkit/ClientCertRequest;', {
    super: 'Ljava/lang/Object;',
    methods: CLIENT_CERT_REQUEST_METHODS,
  }),
  'Landroid/webkit/PermissionRequest;': nativeDef('Landroid/webkit/PermissionRequest;', {
    super: 'Ljava/lang/Object;',
    methods: PERMISSION_REQUEST_METHODS,
  }),
  'Landroid/webkit/GeolocationPermissions$Callback;': nativeDef('Landroid/webkit/GeolocationPermissions$Callback;', {
    super: 'Ljava/lang/Object;',
    methods: GEOLOCATION_CALLBACK_METHODS,
  }),
  'Landroid/webkit/WebView$HitTestResult;': nativeDef('Landroid/webkit/WebView$HitTestResult;', {
    super: 'Ljava/lang/Object;',
    staticFields: new Map([
      ['UNKNOWN_TYPE:I', 0],
      ['ANCHOR_TYPE:I', 1],
      ['PHONE_TYPE:I', 2],
      ['GEO_TYPE:I', 3],
      ['EMAIL_TYPE:I', 4],
      ['IMAGE_TYPE:I', 5],
      ['SRC_ANCHOR_TYPE:I', 6],
      ['SRC_IMAGE_ANCHOR_TYPE:I', 7],
      ['EDIT_TEXT_TYPE:I', 9],
    ]),
    ctor: class HitTestResultPeer {
      constructor() {
        this.$type = 0;
        this.$extra = null;
      }
    },
    methods: HIT_TEST_RESULT_METHODS,
  }),
  'Landroid/webkit/WebChromeClient$FileChooserParams;': nativeDef('Landroid/webkit/WebChromeClient$FileChooserParams;', {
    super: 'Ljava/lang/Object;',
    methods: FILE_CHOOSER_PARAMS_METHODS,
  }),
  'Landroid/webkit/WebView$WebViewTransport;': nativeDef('Landroid/webkit/WebView$WebViewTransport;', {
    super: 'Ljava/lang/Object;',
    methods: WEB_VIEW_TRANSPORT_METHODS,
  }),
};

export { uriObject, parseUriParts };
