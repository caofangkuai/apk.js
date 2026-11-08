import { NativeClassDef } from '../runtime/class-registry.js';
import { toInt } from '../runtime/values.js';
import { View } from './view.js';

function nativeDef(descriptor, options) {
  return new NativeClassDef(descriptor, options);
}

const EGL_SUCCESS = 0x3000;
const EGL_DEFAULT_DISPLAY = null;

function eglDisplayObject(vm) {
  const object = vm.allocateRawObject('Ljavax/microedition/khronos/egl/EGLDisplay;');
  object.$peer = { kind: 'display', id: 1 };
  return object;
}

function eglConfigObject(vm, index = 0) {
  const object = vm.allocateRawObject('Ljavax/microedition/khronos/egl/EGLConfig;');
  object.$peer = { kind: 'config', id: index + 1 };
  return object;
}

function eglSurfaceObject(vm) {
  const object = vm.allocateRawObject('Ljavax/microedition/khronos/egl/EGLSurface;');
  object.$peer = { kind: 'surface', id: 1 };
  return object;
}

function eglContextObject(vm, renderer = null) {
  const object = vm.allocateRawObject('Ljavax/microedition/khronos/egl/EGLContext;');
  object.$peer = { kind: 'context', renderer };
  const gl = vm.allocateRawObject('Ljavax/microedition/khronos/opengles/GL10;');
  gl.$peer = { kind: 'gl' };
  object.$peer.gl = gl;
  object.gl = gl;
  vm._eglContext = object;
  return object;
}

function eglSingleton(vm) {
  if (vm._egl10Object) return vm._egl10Object;
  const object = vm.instantiate('Ljavax/microedition/khronos/egl/EGL10;', []);
  vm._egl10Object = object;
  return object;
}

function writeIntArray(array, index, value) {
  if (!array) return;
  if (Array.isArray(array.$data)) array.$data[index] = value | 0;
  else if (Array.isArray(array)) array[index] = value | 0;
}

function writeObjectArray(array, index, value) {
  if (!array) return;
  if (Array.isArray(array.$data)) array.$data[index] = value;
  else if (Array.isArray(array)) array[index] = value;
}

function arrayLength(array) {
  if (!array) return 0;
  if (Array.isArray(array.$data)) return array.$data.length;
  if (Array.isArray(array)) return array.length;
  return 0;
}

const GL_STRINGS = {
  0x1f00: 'apk.js',
  0x1f01: 'apk.js Software Renderer',
  0x1f02: 'OpenGL ES 3.2 apk.js',
  0x8b8c: 'OpenGL ES GLSL ES 3.20',
  0x1f03: 'GL_EXT_debug_marker GL_OES_texture_npot',
};

function glStringOf(name) {
  return GL_STRINGS[toInt(name) & 0xffff] || 'apk.js';
}

function configAttribValue(attribute) {
  switch (toInt(attribute) & 0xffff) {
    case 0x3020: return 0; // EGL_SAMPLES
    case 0x3021: return 8; // EGL_ALPHA_SIZE
    case 0x3022: return 8; // EGL_BLUE_SIZE
    case 0x3023: return 8; // EGL_GREEN_SIZE
    case 0x3024: return 8; // EGL_RED_SIZE
    case 0x3025: return 24; // EGL_DEPTH_SIZE
    case 0x3026: return 8; // EGL_STENCIL_SIZE
    case 0x3027: return 1; // EGL_NATIVE_RENDERABLE
    case 0x302d: return 0; // EGL_LEVEL
    case 0x302f: return 1; // EGL_CONFIG_ID
    case 0x3031: return 4; // EGL_NATIVE_VISUAL_TYPE
    case 0x3032: return 0; // EGL_CONFIG_CAVEAT
    case 0x3033: return 0x0004; // EGL_SURFACE_TYPE (WINDOW_BIT)
    case 0x3040: return 0x0004; // EGL_RENDERABLE_TYPE (OPENGL_ES2_BIT)
    case 0x3034: return 0; // EGL_TRANSPARENT_TYPE
    case 0x3035: return 0; // EGL_TRANSPARENT_RED_VALUE
    case 0x3036: return 0;
    case 0x3037: return 0;
    case 0x3038: return 0;
    default: return 0;
  }
}

const EGL_DISPLAY = 'Ljavax/microedition/khronos/egl/EGLDisplay;';
const EGL_CONFIG = 'Ljavax/microedition/khronos/egl/EGLConfig;';
const EGL_CONTEXT = 'Ljavax/microedition/khronos/egl/EGLContext;';
const EGL_SURFACE = 'Ljavax/microedition/khronos/egl/EGLSurface;';

const EGL10Methods = {
  'eglGetDisplay(Ljava/lang/Object;)Ljavax/microedition/khronos/egl/EGLDisplay;': (self) => self.display,
  'eglGetCurrentDisplay()Ljavax/microedition/khronos/egl/EGLDisplay;': (self) => self.display,
  'eglInitialize(Ljavax/microedition/khronos/egl/EGLDisplay;[I)Z': (_self, [_display, version]) => {
    writeIntArray(version, 0, 1);
    writeIntArray(version, 1, 4);
    return true;
  },
  'eglTerminate(Ljavax/microedition/khronos/egl/EGLDisplay;)Z': () => true,
  'eglGetError()I': () => EGL_SUCCESS,
  'eglGetConfigs(Ljavax/microedition/khronos/egl/EGLDisplay;[Ljavax/microedition/khronos/egl/EGLConfig;I[I)Z': (self, [_display, configs, size, num]) => {
    const requested = arrayLength(configs);
    const max = Math.max(0, Math.min(requested, toInt(size) | 0, 1));
    const count = requested > 0 ? Math.max(1, max) : 1;
    writeIntArray(num, 0, count);
    for (let i = 0; i < Math.min(requested, count); i++) writeObjectArray(configs, i, eglConfigObject(self.vm, i));
    return true;
  },
  'eglGetConfigAttrib(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLConfig;I[I)Z': (_self, [_display, _config, attribute, value]) => {
    writeIntArray(value, 0, configAttribValue(attribute));
    return true;
  },
  'eglChooseConfig(Ljavax/microedition/khronos/egl/EGLDisplay;[I[Ljavax/microedition/khronos/egl/EGLConfig;I[I)Z': (self, [_display, _attribs, configs, size, num]) => {
    const capacity = arrayLength(configs);
    const count = Math.max(0, Math.min(capacity, toInt(size) | 0, 1));
    writeIntArray(num, 0, capacity > 0 ? count : 1);
    for (let i = 0; i < count; i++) writeObjectArray(configs, i, eglConfigObject(self.vm, i));
    return true;
  },
  'eglQueryString(Ljavax/microedition/khronos/egl/EGLDisplay;I)Ljava/lang/String;': (_self, [_display, name]) => {
    switch (toInt(name) & 0xffff) {
      case 0x3053: return 'Android';
      case 0x3054: return '1.4 apk.js';
      case 0x3055: return 'EGL_KHR_image_base EGL_KHR_gl_texture_2D_image EGL_ANDROID_presentation_time';
      case 0x308d: return 'OpenGL_ES';
      default: return 'apk.js';
    }
  },
  'eglCreateContext(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLConfig;Ljavax/microedition/khronos/egl/EGLContext;[I)Ljavax/microedition/khronos/egl/EGLContext;': (self) => eglContextObject(self.vm),
  'eglDestroyContext(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLContext;)Z': () => true,
  'eglMakeCurrent(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLSurface;Ljavax/microedition/khronos/egl/EGLSurface;Ljavax/microedition/khronos/egl/EGLContext;)Z': (self, [_display, _draw, _read, context]) => {
    self.vm._eglCurrentContext = context ?? null;
    return true;
  },
  'eglGetCurrentContext()Ljavax/microedition/khronos/egl/EGLContext;': (self) => self.vm._eglCurrentContext ?? null,
  'eglCreateWindowSurface(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLConfig;Ljava/lang/Object;[I)Ljavax/microedition/khronos/egl/EGLSurface;': (self) => eglSurfaceObject(self.vm),
  'eglCreatePbufferSurface(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLConfig;[I)Ljavax/microedition/khronos/egl/EGLSurface;': (self) => eglSurfaceObject(self.vm),
  'eglCreatePixmapSurface(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLConfig;Ljava/lang/Object;[I)Ljavax/microedition/khronos/egl/EGLSurface;': (self) => eglSurfaceObject(self.vm),
  'eglDestroySurface(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLSurface;)Z': () => true,
  'eglSwapBuffers(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLSurface;)Z': () => true,
  'eglGetCurrentSurface(I)Ljavax/microedition/khronos/egl/EGLSurface;': (self) => self.vm._eglCurrentSurface ?? null,
  'eglWaitGL()Z': () => true,
  'eglWaitNative(I)Z': () => true,
  'eglCopyBuffers(Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLSurface;Ljava/lang/Object;)Z': () => true,
  'eglBindAPI(I)Z': () => true,
  'eglQueryAPI()I': () => 0x30a0,
  'eglReleaseThread()Z': () => true,
  'eglSwapInterval(Ljavax/microedition/khronos/egl/EGLDisplay;I)Z': () => true,
};

const GL10Methods = {
  'glGetString(I)Ljava/lang/String;': (_self, [name]) => glStringOf(name),
  'glClear(I)V': () => undefined,
  'glClearColor(FFFF)V': () => undefined,
  'glViewport(IIII)V': () => undefined,
  'glEnable(I)V': () => undefined,
  'glDisable(I)V': () => undefined,
  'glFinish()V': () => undefined,
  'glFlush()V': () => undefined,
};

function createGlesClass(descriptor) {
  return nativeDef(descriptor, {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'glGetString(I)Ljava/lang/String;': (_self, [name]) => glStringOf(name),
      'glClear(I)V': () => undefined,
      'glClearColor(FFFF)V': () => undefined,
      'glViewport(IIII)V': () => undefined,
      'glEnable(I)V': () => undefined,
      'glDisable(I)V': () => undefined,
      'glFinish()V': () => undefined,
      'glFlush()V': () => undefined,
      'glGetError()I': () => 0,
      'glGetIntegerv(I[II)V': (_self, [_name, _values, _offset]) => undefined,
      'glGetFloatv(I[FI)V': () => undefined,
    },
  });
}

const GLSurfaceViewPeer = class {
  constructor(vm, object) {
    this.vm = vm;
    this.object = object;
    this.renderer = null;
    this.clientVersion = 1;
    this.renderMode = 0;
    this.$view = new View(vm.contextObject ?? null);
    this.$view.$descriptor = 'Landroid/opengl/GLSurfaceView;';
    this.$view.$javaObject = object;
    object.$view = this.$view;
  }
};

const GLSurfaceView = nativeDef('Landroid/opengl/GLSurfaceView;', {
  super: 'Landroid/view/View;',
  ctor: GLSurfaceViewPeer,
  methods: {
    '<init>(Landroid/content/Context;)V': (self, [context]) => {
      if (self.$view) self.$view.context = context ?? self.$view.context;
    },
    '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (self, [context]) => {
      if (self.$view) self.$view.context = context ?? self.$view.context;
    },
    'setEGLContextClientVersion(I)V': (self, [version]) => {
      self.clientVersion = toInt(version);
    },
    'setRenderer(Landroid/opengl/GLSurfaceView$Renderer;)V': (self, [renderer]) => {
      self.renderer = renderer ?? null;
      const vm = self.vm;
      if (!renderer || !vm) return;
      try {
        const gl = eglContextObject(vm).$peer?.gl ?? vm.allocateRawObject('Ljavax/microedition/khronos/opengles/GL10;');
        const config = eglConfigObject(vm, 0);
        vm.invoke(
          { classDesc: 'Landroid/opengl/GLSurfaceView$Renderer;', name: 'onSurfaceCreated', proto: { descriptor: '(Ljavax/microedition/khronos/opengles/GL10;Ljavax/microedition/khronos/egl/EGLConfig;)V', parameters: ['Ljavax/microedition/khronos/opengles/GL10;', 'Ljavax/microedition/khronos/egl/EGLConfig;'], returnType: 'V' } },
          renderer,
          [gl, config],
          'interface',
        );
        const [width, height] = [self.$view?.getWidth?.() || 0, self.$view?.getHeight?.() || 0];
        vm.invoke(
          { classDesc: 'Landroid/opengl/GLSurfaceView$Renderer;', name: 'onSurfaceChanged', proto: { descriptor: '(Ljavax/microedition/khronos/opengles/GL10;II)V', parameters: ['Ljavax/microedition/khronos/opengles/GL10;', 'I', 'I'], returnType: 'V' } },
          renderer,
          [gl, width, height],
          'interface',
        );
      } catch (_error) {
        void _error;
      }
    },
    'setRenderMode(I)V': (self, [mode]) => { self.renderMode = toInt(mode); },
    'requestRender()V': (self) => {
      const vm = self.vm;
      if (!self.renderer || !vm) return;
      try {
        const gl = vm._eglContext?.gl ?? eglContextObject(vm).gl;
        vm.invoke(
          { classDesc: 'Landroid/opengl/GLSurfaceView$Renderer;', name: 'onDrawFrame', proto: { descriptor: '(Ljavax/microedition/khronos/opengles/GL10;)V', parameters: ['Ljavax/microedition/khronos/opengles/GL10;'], returnType: 'V' } },
          self.renderer,
          [gl],
          'interface',
        );
      } catch (_error) {
        void _error;
      }
    },
    'queueEvent(Ljava/lang/Runnable;)V': (self, [runnable], vm) => {
      try {
        vm.invokeInterface(runnable, 'run', '()V', []);
      } catch (_error) {
        void _error;
      }
    },
    'onPause()V': () => undefined,
    'onResume()V': () => undefined,
    'setEGLConfigChooser(IIIIII)V': () => undefined,
    'setEGLConfigChooser(Z)V': () => undefined,
    'setDebugFlags(I)V': () => undefined,
    'getPreserveEGLContextOnPause()Z': () => 0,
    'setPreserveEGLContextOnPause(Z)V': () => undefined,
  },
});

export const OPENGL_CLASSES = {
  EGL: nativeDef('Ljavax/microedition/khronos/egl/EGL;', { super: 'Ljava/lang/Object;' }),
  EGL10: nativeDef('Ljavax/microedition/khronos/egl/EGL10;', {
    super: 'Ljavax/microedition/khronos/egl/EGL;',
    ctor: class EGL10Peer {
      constructor(vm) {
        this.vm = vm;
        this.display = eglDisplayObject(vm);
      }
    },
    staticFields: new Map([
      ['EGL_DEFAULT_DISPLAY:Ljava/lang/Object;', EGL_DEFAULT_DISPLAY],
      ['EGL_NO_DISPLAY:Ljavax/microedition/khronos/egl/EGLDisplay;', null],
      ['EGL_NO_CONTEXT:Ljavax/microedition/khronos/egl/EGLContext;', null],
      ['EGL_NO_SURFACE:Ljavax/microedition/khronos/egl/EGLSurface;', null],
      ['EGL_SUCCESS:I', EGL_SUCCESS],
      ['EGL_FALSE:I', 0],
      ['EGL_TRUE:I', 1],
      ['EGL_OPENGL_ES_API:I', 0x30a0],
      ['EGL_OPENGL_ES_BIT:I', 0x0001],
      ['EGL_OPENGL_ES2_BIT:I', 0x0004],
      ['EGL_OPENGL_ES3_BIT_KHR:I', 0x0040],
      ['EGL_RENDERABLE_TYPE:I', 0x3040],
      ['EGL_NONE:I', 0x3038],
      ['EGL_WINDOW_BIT:I', 0x0004],
      ['EGL_SURFACE_TYPE:I', 0x3033],
      ['EGL_RED_SIZE:I', 0x3024],
      ['EGL_GREEN_SIZE:I', 0x3023],
      ['EGL_BLUE_SIZE:I', 0x3022],
      ['EGL_ALPHA_SIZE:I', 0x3021],
      ['EGL_DEPTH_SIZE:I', 0x3025],
      ['EGL_STENCIL_SIZE:I', 0x3026],
      ['EGL_VENDOR:I', 0x3053],
      ['EGL_VERSION:I', 0x3054],
      ['EGL_EXTENSIONS:I', 0x3055],
      ['EGL_CLIENT_APIS:I', 0x308d],
    ]),
    methods: EGL10Methods,
  }),
  EGLDisplay: nativeDef(EGL_DISPLAY, { super: 'Ljava/lang/Object;' }),
  EGLConfig: nativeDef(EGL_CONFIG, { super: 'Ljava/lang/Object;' }),
  EGLSurface: nativeDef(EGL_SURFACE, { super: 'Ljava/lang/Object;' }),
  EGLContext: nativeDef(EGL_CONTEXT, {
    super: 'Ljava/lang/Object;',
    methods: {
      'getGL()Ljavax/microedition/khronos/opengles/GL;': (self) => self.gl ?? null,
    },
    staticMethods: {
      'getEGL()Ljavax/microedition/khronos/egl/EGL;': (_self, _args, vm) => eglSingleton(vm),
      'getCurrent()Ljavax/microedition/khronos/egl/EGLContext;': (_self, _args, vm) => vm._eglCurrentContext ?? null,
    },
  }),
  GL: nativeDef('Ljavax/microedition/khronos/opengles/GL;', { super: 'Ljava/lang/Object;' }),
  GL10: nativeDef('Ljavax/microedition/khronos/opengles/GL10;', {
    super: 'Ljavax/microedition/khronos/opengles/GL;',
    methods: GL10Methods,
  }),
  GLES20: createGlesClass('Landroid/opengl/GLES20;'),
  GLES30: createGlesClass('Landroid/opengl/GLES30;'),
  GLSurfaceView,
  GLSurfaceViewRenderer: nativeDef('Landroid/opengl/GLSurfaceView$Renderer;', {
    super: 'Ljava/lang/Object;',
    interfaces: ['Landroid/opengl/GLSurfaceView$Renderer;'],
  }),
};
