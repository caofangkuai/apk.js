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

/** 把 [I / [F / [Z 输出参数清零（无 GPU 时 GL 的 query 结果均为 0）。 */
function zeroFill(array, count) {
  const length = Math.min(arrayLength(array), count | 0);
  for (let index = 0; index < length; index++) writeIntArray(array, index, 0);
}

const GL10Methods = {
  'glGetString(I)Ljava/lang/String;': (_self, [name]) => glStringOf(name),
  'glClear(I)V': () => undefined,
  'glClearColor(FFFF)V': () => undefined,
  'glClearColorx(IIII)V': () => undefined,
  'glViewport(IIII)V': () => undefined,
  'glEnable(I)V': () => undefined,
  'glDisable(I)V': () => undefined,
  'glFinish()V': () => undefined,
  'glFlush()V': () => undefined,
  'glGetError()I': () => 0,
  'glShadeModel(I)V': () => undefined,
  'glMatrixMode(I)V': () => undefined,
  'glLoadIdentity()V': () => undefined,
  'glMultMatrixf([FI)V': () => undefined,
  'glOrthof(FFFFFF)V': () => undefined,
  'glFrustumf(FFFFFF)V': () => undefined,
  'glEnableClientState(I)V': () => undefined,
  'glDisableClientState(I)V': () => undefined,
  'glVertexPointer(IIILjava/nio/Buffer;)V': () => undefined,
  'glColorPointer(IIILjava/nio/Buffer;)V': () => undefined,
  'glNormalPointer(ILjava/nio/Buffer;)V': () => undefined,
  'glTexCoordPointer(IIILjava/nio/Buffer;)V': () => undefined,
  'glDrawArrays(III)V': () => undefined,
  'glDrawElements(IIILjava/nio/Buffer;)V': () => undefined,
  'glColor4x(IIII)V': () => undefined,
  'glColor4f(FFFF)V': () => undefined,
  'glBlendFunc(II)V': () => undefined,
  'glDepthFunc(I)V': () => undefined,
  'glDepthMask(Z)V': () => undefined,
  'glCullFace(I)V': () => undefined,
  'glFrontFace(I)V': () => undefined,
  'glScalef(FFF)V': () => undefined,
  'glTranslatef(FFF)V': () => undefined,
  'glRotatef(FFFF)V': () => undefined,
  'glPushMatrix()V': () => undefined,
  'glPopMatrix()V': () => undefined,
  'glGenTextures(I[II)V': (_self, [_count, textures]) => zeroFill(textures, arrayLength(textures)),
  'glBindTexture(II)V': () => undefined,
  'glDeleteTextures(I[II)V': () => undefined,
  'glTexParameteri(III)V': () => undefined,
  'glTexParameterx(III)V': () => undefined,
  'glTexImage2D(IIIIIIIILjava/nio/Buffer;)V': () => undefined,
  'glTexSubImage2D(IIIIIIIILjava/nio/Buffer;)V': () => undefined,
  'glTexEnvx(III)V': () => undefined,
  'glTexEnvf(IIF)V': () => undefined,
  'glMaterialf(IIF)V': () => undefined,
  'glMaterialx(III)V': () => undefined,
  'glLightf(IIF)V': () => undefined,
  'glLightx(III)V': () => undefined,
  'glLightModelf(IF)V': () => undefined,
  'glLightModelx(II)V': () => undefined,
  'glNormal3x(III)V': () => undefined,
  'glNormal3f(FFF)V': () => undefined,
  'glLineWidthx(I)V': () => undefined,
  'glPointSizex(I)V': () => undefined,
  'glPolygonOffsetx(II)V': () => undefined,
  'glGetIntegerv(I[II)V': (_self, [_name, values, offset]) => zeroFill(values, arrayLength(values) - (toInt(offset) | 0)),
  'glGetFloatv(I[FI)V': (_self, [_name, values]) => zeroFill(values, arrayLength(values)),
};

const GLES_COMMON_METHODS = {
  'glGetString(I)Ljava/lang/String;': (_self, [name]) => glStringOf(name),
  'glGetError()I': () => 0,
  'glClear(I)V': () => undefined,
  'glClearColor(FFFF)V': () => undefined,
  'glClearDepthf(F)V': () => undefined,
  'glClearStencil(I)V': () => undefined,
  'glViewport(IIII)V': () => undefined,
  'glScissor(IIII)V': () => undefined,
  'glEnable(I)V': () => undefined,
  'glDisable(I)V': () => undefined,
  'glBlendFunc(II)V': () => undefined,
  'glBlendFuncSeparate(IIII)V': () => undefined,
  'glBlendEquation(I)V': () => undefined,
  'glBlendColor(FFFF)V': () => undefined,
  'glDepthFunc(I)V': () => undefined,
  'glDepthMask(Z)V': () => undefined,
  'glDepthRangef(FF)V': () => undefined,
  'glColorMask(ZZZZ)V': () => undefined,
  'glCullFace(I)V': () => undefined,
  'glFrontFace(I)V': () => undefined,
  'glLineWidth(F)V': () => undefined,
  'glPolygonOffset(FF)V': () => undefined,
  'glPixelStorei(II)V': () => undefined,
  'glFinish()V': () => undefined,
  'glFlush()V': () => undefined,
  'glCreateProgram()I': () => 0,
  'glCreateShader(I)I': () => 0,
  'glShaderSource(ILjava/lang/String;)V': () => undefined,
  'glShaderSource(II[Ljava/lang/String;[I)V': () => undefined,
  'glCompileShader(I)V': () => undefined,
  'glAttachShader(II)V': () => undefined,
  'glDetachShader(II)V': () => undefined,
  'glLinkProgram(I)V': () => undefined,
  'glUseProgram(I)V': () => undefined,
  'glDeleteShader(I)V': () => undefined,
  'glDeleteProgram(I)V': () => undefined,
  'glValidateProgram(I)V': () => undefined,
  'glBindAttribLocation(IILjava/lang/String;)V': () => undefined,
  'glGetAttribLocation(ILjava/lang/String;)I': () => -1,
  'glGetUniformLocation(ILjava/lang/String;)I': () => -1,
  'glGetShaderiv(II[II)V': (_self, [_shader, _pname, params]) => zeroFill(params, arrayLength(params)),
  'glGetProgramiv(II[II)V': (_self, [_program, _pname, params]) => zeroFill(params, arrayLength(params)),
  'glGetShaderInfoLog(I)Ljava/lang/String;': () => '',
  'glGetProgramInfoLog(I)Ljava/lang/String;': () => '',
  'glEnableVertexAttribArray(I)V': () => undefined,
  'glDisableVertexAttribArray(I)V': () => undefined,
  'glVertexAttribPointer(IIIZII)V': () => undefined,
  'glVertexAttribPointer(IIIZILjava/nio/Buffer;)V': () => undefined,
  'glVertexAttrib1f(IF)V': () => undefined,
  'glVertexAttrib2f(IFF)V': () => undefined,
  'glVertexAttrib3f(IFFF)V': () => undefined,
  'glVertexAttrib4f(IFFFF)V': () => undefined,
  'glDrawArrays(III)V': () => undefined,
  'glDrawElements(IIII)V': () => undefined,
  'glDrawElements(IIILjava/nio/Buffer;)V': () => undefined,
  'glGenBuffers(I[II)V': (_self, [_count, buffers]) => zeroFill(buffers, arrayLength(buffers)),
  'glBindBuffer(II)V': () => undefined,
  'glBufferData(IILjava/nio/Buffer;I)V': () => undefined,
  'glBufferSubData(IIILjava/nio/Buffer;)V': () => undefined,
  'glDeleteBuffers(I[II)V': () => undefined,
  'glIsBuffer(I)Z': () => false,
  'glGenTextures(I[II)V': (_self, [_count, textures]) => zeroFill(textures, arrayLength(textures)),
  'glBindTexture(II)V': () => undefined,
  'glDeleteTextures(I[II)V': () => undefined,
  'glActiveTexture(I)V': () => undefined,
  'glGenerateMipmap(I)V': () => undefined,
  'glTexParameteri(III)V': () => undefined,
  'glTexParameterf(IIF)V': () => undefined,
  'glTexImage2D(IIIIIIIILjava/nio/Buffer;)V': () => undefined,
  'glTexSubImage2D(IIIIIIIILjava/nio/Buffer;)V': () => undefined,
  'glCompressedTexImage2D(IIIIIIILjava/nio/Buffer;)V': () => undefined,
  'glUniform1i(II)V': () => undefined,
  'glUniform1f(IF)V': () => undefined,
  'glUniform2f(IFF)V': () => undefined,
  'glUniform3f(IFFF)V': () => undefined,
  'glUniform4f(IFFFF)V': () => undefined,
  'glUniform1fv(I[FI)V': () => undefined,
  'glUniform2fv(I[FI)V': () => undefined,
  'glUniform3fv(I[FI)V': () => undefined,
  'glUniform4fv(I[FI)V': () => undefined,
  'glUniform2i(III)V': () => undefined,
  'glUniform3i(IIII)V': () => undefined,
  'glUniform4i(IIIII)V': () => undefined,
  'glUniformMatrix2fv(IZ[FI)V': () => undefined,
  'glUniformMatrix3fv(IZ[FI)V': () => undefined,
  'glUniformMatrix4fv(IZ[FI)V': () => undefined,
  'glGetIntegerv(I[II)V': (_self, [_name, values]) => zeroFill(values, arrayLength(values)),
  'glGetFloatv(I[FI)V': (_self, [_name, values]) => zeroFill(values, arrayLength(values)),
  'glGetBooleanv(I[ZI)V': (_self, [_name, values]) => zeroFill(values, arrayLength(values)),
  'glIsEnabled(I)Z': () => false,
  'glReadPixels(IIIIIILjava/nio/Buffer;)V': () => undefined,
};

const GLES30_EXTRA_METHODS = {
  'glReadBuffer(I)V': () => undefined,
  'glDrawRangeElements(IIIII)V': () => undefined,
  'glTexStorage2D(IIIII)V': () => undefined,
  'glTexStorage3D(IIIIII)V': () => undefined,
  'glBindVertexArray(I)V': () => undefined,
  'glDeleteVertexArrays(I[II)V': () => undefined,
  'glGenVertexArrays(I[II)V': (_self, [_count, arrays]) => zeroFill(arrays, arrayLength(arrays)),
  'glBindSampler(II)V': () => undefined,
  'glBindFramebuffer(II)V': () => undefined,
  'glBindRenderbuffer(II)V': () => undefined,
  'glBlitFramebuffer(IIIIIIIIII)V': () => undefined,
  'glRenderbufferStorageMultisample(IIIII)V': () => undefined,
  'glFramebufferTexture2D(IIIII)V': () => undefined,
  'glGenFramebuffers(I[II)V': (_self, [_count, buffers]) => zeroFill(buffers, arrayLength(buffers)),
  'glDeleteFramebuffers(I[II)V': () => undefined,
  'glGenRenderbuffers(I[II)V': (_self, [_count, buffers]) => zeroFill(buffers, arrayLength(buffers)),
  'glDeleteRenderbuffers(I[II)V': () => undefined,
  'glCheckFramebufferStatus(I)I': () => 0,
  'glVertexAttribDivisor(II)V': () => undefined,
  'glDrawArraysInstanced(IIII)V': () => undefined,
  'glDrawElementsInstanced(IIIII)V': () => undefined,
  'glDrawBuffers(I[II)V': () => undefined,
  'glUniformBlockBinding(III)V': () => undefined,
  'glGetUniformBlockIndex(ILjava/lang/String;)I': () => -1,
  'glBindBufferBase(III)V': () => undefined,
  'glGetActiveUniformBlockiv(III[II)V': (_self, [_program, _index, _pname, params]) => zeroFill(params, arrayLength(params)),
  'glMapBufferRange(IIIJ)I': () => 0,
  'glUnmapBuffer(I)Z': () => false,
  'glCopyBufferSubData(IIJJJ)V': () => undefined,
  'glInvalidateFramebuffer(II[II)V': () => undefined,
  'glBeginQuery(II)V': () => undefined,
  'glEndQuery(I)V': () => undefined,
};

/**
 * GL/GLES 其余方法在没有 GPU 的模拟器里没有可观察行为，统一按返回类型给出默认值：
 * void → undefined，int/long → 0，boolean → false，String → 空串，Buffer → null；
 * 带 [I / [F / [J / [B 输出参数的 getter 会把数组清零（与真实驱动的初始查询结果一致）。
 */
const GL_STUB_SIGNATURES = [
  'glBindFramebuffer(II)V',
  'glBindRenderbuffer(II)V',
  'glBlendEquationSeparate(II)V',
  'glCheckFramebufferStatus(I)I',
  'glCompressedTexSubImage2D(IIIIIIIILjava/nio/Buffer;)V',
  'glCopyTexImage2D(IIIIIIII)V',
  'glCopyTexSubImage2D(IIIIIIII)V',
  'glDeleteBuffers(ILjava/nio/IntBuffer;)V',
  'glDeleteFramebuffers(I[II)V',
  'glDeleteFramebuffers(ILjava/nio/IntBuffer;)V',
  'glDeleteRenderbuffers(I[II)V',
  'glDeleteRenderbuffers(ILjava/nio/IntBuffer;)V',
  'glDeleteTextures(ILjava/nio/IntBuffer;)V',
  'glFramebufferRenderbuffer(IIII)V',
  'glFramebufferTexture2D(IIIII)V',
  'glGenBuffers(ILjava/nio/IntBuffer;)V',
  'glGenFramebuffers(I[II)V',
  'glGenFramebuffers(ILjava/nio/IntBuffer;)V',
  'glGenRenderbuffers(I[II)V',
  'glGenRenderbuffers(ILjava/nio/IntBuffer;)V',
  'glGenTextures(ILjava/nio/IntBuffer;)V',
  'glGetActiveAttrib(III[II[II[II[BI)V',
  'glGetActiveAttrib(II[II[II)Ljava/lang/String;',
  'glGetActiveAttrib(IILjava/nio/IntBuffer;Ljava/nio/IntBuffer;)Ljava/lang/String;',
  'glGetActiveUniform(III[II[II[II[BI)V',
  'glGetActiveUniform(II[II[II)Ljava/lang/String;',
  'glGetActiveUniform(IILjava/nio/IntBuffer;Ljava/nio/IntBuffer;)Ljava/lang/String;',
  'glGetAttachedShaders(II[II[II)V',
  'glGetAttachedShaders(IILjava/nio/IntBuffer;Ljava/nio/IntBuffer;)V',
  'glGetBooleanv(ILjava/nio/IntBuffer;)V',
  'glGetBufferParameteriv(II[II)V',
  'glGetBufferParameteriv(IILjava/nio/IntBuffer;)V',
  'glGetFloatv(ILjava/nio/FloatBuffer;)V',
  'glGetFramebufferAttachmentParameteriv(III[II)V',
  'glGetFramebufferAttachmentParameteriv(IIILjava/nio/IntBuffer;)V',
  'glGetIntegerv(ILjava/nio/IntBuffer;)V',
  'glGetProgramiv(IILjava/nio/IntBuffer;)V',
  'glGetRenderbufferParameteriv(II[II)V',
  'glGetRenderbufferParameteriv(IILjava/nio/IntBuffer;)V',
  'glGetShaderiv(IILjava/nio/IntBuffer;)V',
  'glGetShaderPrecisionFormat(II[II[II)V',
  'glGetShaderPrecisionFormat(IILjava/nio/IntBuffer;Ljava/nio/IntBuffer;)V',
  'glGetShaderSource(II[II[BI)V',
  'glGetShaderSource(I)Ljava/lang/String;',
  'glGetTexParameterfv(II[FI)V',
  'glGetTexParameterfv(IILjava/nio/FloatBuffer;)V',
  'glGetTexParameteriv(II[II)V',
  'glGetTexParameteriv(IILjava/nio/IntBuffer;)V',
  'glGetUniformfv(II[FI)V',
  'glGetUniformfv(IILjava/nio/FloatBuffer;)V',
  'glGetUniformiv(II[II)V',
  'glGetUniformiv(IILjava/nio/IntBuffer;)V',
  'glGetVertexAttribfv(II[FI)V',
  'glGetVertexAttribfv(IILjava/nio/FloatBuffer;)V',
  'glGetVertexAttribiv(II[II)V',
  'glGetVertexAttribiv(IILjava/nio/IntBuffer;)V',
  'glHint(II)V',
  'glIsFramebuffer(I)Z',
  'glIsProgram(I)Z',
  'glIsRenderbuffer(I)Z',
  'glIsShader(I)Z',
  'glIsTexture(I)Z',
  'glReleaseShaderCompiler()V',
  'glRenderbufferStorage(IIII)V',
  'glSampleCoverage(FZ)V',
  'glShaderBinary(I[IIILjava/nio/Buffer;I)V',
  'glShaderBinary(ILjava/nio/IntBuffer;ILjava/nio/Buffer;I)V',
  'glStencilFunc(III)V',
  'glStencilFuncSeparate(IIII)V',
  'glStencilMask(I)V',
  'glStencilMaskSeparate(II)V',
  'glStencilOp(III)V',
  'glStencilOpSeparate(IIII)V',
  'glTexParameterfv(II[FI)V',
  'glTexParameterfv(IILjava/nio/FloatBuffer;)V',
  'glTexParameteriv(II[II)V',
  'glTexParameteriv(IILjava/nio/IntBuffer;)V',
  'glUniform1fv(II[FI)V',
  'glUniform1fv(IILjava/nio/FloatBuffer;)V',
  'glUniform1iv(II[II)V',
  'glUniform1iv(IILjava/nio/IntBuffer;)V',
  'glUniform2fv(II[FI)V',
  'glUniform2fv(IILjava/nio/FloatBuffer;)V',
  'glUniform2iv(II[II)V',
  'glUniform2iv(IILjava/nio/IntBuffer;)V',
  'glUniform3fv(II[FI)V',
  'glUniform3fv(IILjava/nio/FloatBuffer;)V',
  'glUniform3iv(II[II)V',
  'glUniform3iv(IILjava/nio/IntBuffer;)V',
  'glUniform4fv(II[FI)V',
  'glUniform4fv(IILjava/nio/FloatBuffer;)V',
  'glUniform4iv(II[II)V',
  'glUniform4iv(IILjava/nio/IntBuffer;)V',
  'glUniformMatrix2fv(IIZ[FI)V',
  'glUniformMatrix2fv(IIZLjava/nio/FloatBuffer;)V',
  'glUniformMatrix3fv(IIZ[FI)V',
  'glUniformMatrix3fv(IIZLjava/nio/FloatBuffer;)V',
  'glUniformMatrix4fv(IIZ[FI)V',
  'glUniformMatrix4fv(IIZLjava/nio/FloatBuffer;)V',
  'glVertexAttrib1fv(I[FI)V',
  'glVertexAttrib1fv(ILjava/nio/FloatBuffer;)V',
  'glVertexAttrib2fv(I[FI)V',
  'glVertexAttrib2fv(ILjava/nio/FloatBuffer;)V',
  'glVertexAttrib3fv(I[FI)V',
  'glVertexAttrib3fv(ILjava/nio/FloatBuffer;)V',
  'glVertexAttrib4fv(I[FI)V',
  'glVertexAttrib4fv(ILjava/nio/FloatBuffer;)V',
  'glDrawRangeElements(IIIIILjava/nio/Buffer;)V',
  'glDrawRangeElements(IIIIII)V',
  'glTexImage3D(IIIIIIIIILjava/nio/Buffer;)V',
  'glTexImage3D(IIIIIIIIII)V',
  'glTexSubImage3D(IIIIIIIIIILjava/nio/Buffer;)V',
  'glTexSubImage3D(IIIIIIIIIII)V',
  'glCopyTexSubImage3D(IIIIIIIII)V',
  'glCompressedTexImage3D(IIIIIIIILjava/nio/Buffer;)V',
  'glCompressedTexImage3D(IIIIIIIII)V',
  'glCompressedTexSubImage3D(IIIIIIIIIILjava/nio/Buffer;)V',
  'glCompressedTexSubImage3D(IIIIIIIIIII)V',
  'glGenQueries(I[II)V',
  'glGenQueries(ILjava/nio/IntBuffer;)V',
  'glDeleteQueries(I[II)V',
  'glDeleteQueries(ILjava/nio/IntBuffer;)V',
  'glIsQuery(I)Z',
  'glGetQueryiv(II[II)V',
  'glGetQueryiv(IILjava/nio/IntBuffer;)V',
  'glGetQueryObjectuiv(II[II)V',
  'glGetQueryObjectuiv(IILjava/nio/IntBuffer;)V',
  'glGetBufferPointerv(II)Ljava/nio/Buffer;',
  'glDrawBuffers(ILjava/nio/IntBuffer;)V',
  'glUniformMatrix2x3fv(IIZ[FI)V',
  'glUniformMatrix2x3fv(IIZLjava/nio/FloatBuffer;)V',
  'glUniformMatrix3x2fv(IIZ[FI)V',
  'glUniformMatrix3x2fv(IIZLjava/nio/FloatBuffer;)V',
  'glUniformMatrix2x4fv(IIZ[FI)V',
  'glUniformMatrix2x4fv(IIZLjava/nio/FloatBuffer;)V',
  'glUniformMatrix4x2fv(IIZ[FI)V',
  'glUniformMatrix4x2fv(IIZLjava/nio/FloatBuffer;)V',
  'glUniformMatrix3x4fv(IIZ[FI)V',
  'glUniformMatrix3x4fv(IIZLjava/nio/FloatBuffer;)V',
  'glUniformMatrix4x3fv(IIZ[FI)V',
  'glUniformMatrix4x3fv(IIZLjava/nio/FloatBuffer;)V',
  'glFramebufferTextureLayer(IIIII)V',
  'glMapBufferRange(IIII)Ljava/nio/Buffer;',
  'glFlushMappedBufferRange(III)V',
  'glDeleteVertexArrays(ILjava/nio/IntBuffer;)V',
  'glGenVertexArrays(ILjava/nio/IntBuffer;)V',
  'glIsVertexArray(I)Z',
  'glGetIntegeri_v(II[II)V',
  'glGetIntegeri_v(IILjava/nio/IntBuffer;)V',
  'glBeginTransformFeedback(I)V',
  'glEndTransformFeedback()V',
  'glBindBufferRange(IIIII)V',
  'glTransformFeedbackVaryings(I[Ljava/lang/String;I)V',
  'glGetTransformFeedbackVarying(III[II[II[II[BI)V',
  'glGetTransformFeedbackVarying(IIILjava/nio/IntBuffer;Ljava/nio/IntBuffer;Ljava/nio/IntBuffer;B)V',
  'glGetTransformFeedbackVarying(IIILjava/nio/IntBuffer;Ljava/nio/IntBuffer;Ljava/nio/IntBuffer;Ljava/nio/ByteBuffer;)V',
  'glGetTransformFeedbackVarying(II[II[II)Ljava/lang/String;',
  'glGetTransformFeedbackVarying(IILjava/nio/IntBuffer;Ljava/nio/IntBuffer;)Ljava/lang/String;',
  'glVertexAttribIPointer(IIIILjava/nio/Buffer;)V',
  'glVertexAttribIPointer(IIIII)V',
  'glGetVertexAttribIiv(II[II)V',
  'glGetVertexAttribIiv(IILjava/nio/IntBuffer;)V',
  'glGetVertexAttribIuiv(II[II)V',
  'glGetVertexAttribIuiv(IILjava/nio/IntBuffer;)V',
  'glVertexAttribI4i(IIIII)V',
  'glVertexAttribI4ui(IIIII)V',
  'glVertexAttribI4iv(I[II)V',
  'glVertexAttribI4iv(ILjava/nio/IntBuffer;)V',
  'glVertexAttribI4uiv(I[II)V',
  'glVertexAttribI4uiv(ILjava/nio/IntBuffer;)V',
  'glGetUniformuiv(II[II)V',
  'glGetUniformuiv(IILjava/nio/IntBuffer;)V',
  'glGetFragDataLocation(ILjava/lang/String;)I',
  'glUniform1ui(II)V',
  'glUniform2ui(III)V',
  'glUniform3ui(IIII)V',
  'glUniform4ui(IIIII)V',
  'glUniform1uiv(II[II)V',
  'glUniform1uiv(IILjava/nio/IntBuffer;)V',
  'glUniform2uiv(II[II)V',
  'glUniform2uiv(IILjava/nio/IntBuffer;)V',
  'glUniform3uiv(II[II)V',
  'glUniform3uiv(IILjava/nio/IntBuffer;)V',
  'glUniform4uiv(II[II)V',
  'glUniform4uiv(IILjava/nio/IntBuffer;)V',
  'glClearBufferiv(II[II)V',
  'glClearBufferiv(IILjava/nio/IntBuffer;)V',
  'glClearBufferuiv(II[II)V',
  'glClearBufferuiv(IILjava/nio/IntBuffer;)V',
  'glClearBufferfv(II[FI)V',
  'glClearBufferfv(IILjava/nio/FloatBuffer;)V',
  'glClearBufferfi(IIFI)V',
  'glGetStringi(II)Ljava/lang/String;',
  'glCopyBufferSubData(IIIII)V',
  'glGetUniformIndices(I[Ljava/lang/String;[II)V',
  'glGetUniformIndices(I[Ljava/lang/String;Ljava/nio/IntBuffer;)V',
  'glGetActiveUniformsiv(II[III[II)V',
  'glGetActiveUniformsiv(IILjava/nio/IntBuffer;ILjava/nio/IntBuffer;)V',
  'glGetActiveUniformBlockiv(IIILjava/nio/IntBuffer;)V',
  'glGetActiveUniformBlockName(III[II[BI)V',
  'glGetActiveUniformBlockName(IILjava/nio/Buffer;Ljava/nio/Buffer;)V',
  'glGetActiveUniformBlockName(II)Ljava/lang/String;',
  'glDrawElementsInstanced(IIILjava/nio/Buffer;I)V',
  'glFenceSync(II)J',
  'glIsSync(J)Z',
  'glDeleteSync(J)V',
  'glClientWaitSync(JIJ)I',
  'glWaitSync(JIJ)V',
  'glGetInteger64v(I[JI)V',
  'glGetInteger64v(ILjava/nio/LongBuffer;)V',
  'glGetSynciv(JII[II[II)V',
  'glGetSynciv(JIILjava/nio/IntBuffer;Ljava/nio/IntBuffer;)V',
  'glGetInteger64i_v(II[JI)V',
  'glGetInteger64i_v(IILjava/nio/LongBuffer;)V',
  'glGetBufferParameteri64v(II[JI)V',
  'glGetBufferParameteri64v(IILjava/nio/LongBuffer;)V',
  'glGenSamplers(I[II)V',
  'glGenSamplers(ILjava/nio/IntBuffer;)V',
  'glDeleteSamplers(I[II)V',
  'glDeleteSamplers(ILjava/nio/IntBuffer;)V',
  'glIsSampler(I)Z',
  'glSamplerParameteri(III)V',
  'glSamplerParameteriv(II[II)V',
  'glSamplerParameteriv(IILjava/nio/IntBuffer;)V',
  'glSamplerParameterf(IIF)V',
  'glSamplerParameterfv(II[FI)V',
  'glSamplerParameterfv(IILjava/nio/FloatBuffer;)V',
  'glGetSamplerParameteriv(II[II)V',
  'glGetSamplerParameteriv(IILjava/nio/IntBuffer;)V',
  'glGetSamplerParameterfv(II[FI)V',
  'glGetSamplerParameterfv(IILjava/nio/FloatBuffer;)V',
  'glBindTransformFeedback(II)V',
  'glDeleteTransformFeedbacks(I[II)V',
  'glDeleteTransformFeedbacks(ILjava/nio/IntBuffer;)V',
  'glGenTransformFeedbacks(I[II)V',
  'glGenTransformFeedbacks(ILjava/nio/IntBuffer;)V',
  'glIsTransformFeedback(I)Z',
  'glPauseTransformFeedback()V',
  'glResumeTransformFeedback()V',
  'glGetProgramBinary(II[II[IILjava/nio/Buffer;)V',
  'glGetProgramBinary(IILjava/nio/IntBuffer;Ljava/nio/IntBuffer;Ljava/nio/Buffer;)V',
  'glProgramBinary(IILjava/nio/Buffer;I)V',
  'glProgramParameteri(III)V',
  'glInvalidateFramebuffer(IILjava/nio/IntBuffer;)V',
  'glInvalidateSubFramebuffer(II[IIIIII)V',
  'glInvalidateSubFramebuffer(IILjava/nio/IntBuffer;IIII)V',
  'glGetInternalformativ(IIII[II)V',
  'glGetInternalformativ(IIIILjava/nio/IntBuffer;)V',
  'glReadPixels(IIIIIII)V',
  'glActiveTexture(I)V',
  'glAlphaFunc(IF)V',
  'glAlphaFuncx(II)V',
  'glClearDepthf(F)V',
  'glClearDepthx(I)V',
  'glClearStencil(I)V',
  'glClientActiveTexture(I)V',
  'glColorMask(ZZZZ)V',
  'glCompressedTexImage2D(IIIIIIILjava/nio/Buffer;)V',
  'glDepthRangef(FF)V',
  'glDepthRangex(II)V',
  'glFogf(IF)V',
  'glFogfv(I[FI)V',
  'glFogfv(ILjava/nio/FloatBuffer;)V',
  'glFogx(II)V',
  'glFogxv(I[II)V',
  'glFogxv(ILjava/nio/IntBuffer;)V',
  'glFrustumx(IIIIII)V',
  'glLightModelfv(I[FI)V',
  'glLightModelfv(ILjava/nio/FloatBuffer;)V',
  'glLightModelxv(I[II)V',
  'glLightModelxv(ILjava/nio/IntBuffer;)V',
  'glLightfv(II[FI)V',
  'glLightfv(IILjava/nio/FloatBuffer;)V',
  'glLightxv(II[II)V',
  'glLightxv(IILjava/nio/IntBuffer;)V',
  'glLineWidth(F)V',
  'glLoadMatrixf([FI)V',
  'glLoadMatrixf(Ljava/nio/FloatBuffer;)V',
  'glLoadMatrixx([II)V',
  'glLoadMatrixx(Ljava/nio/IntBuffer;)V',
  'glLogicOp(I)V',
  'glMaterialfv(II[FI)V',
  'glMaterialfv(IILjava/nio/FloatBuffer;)V',
  'glMaterialxv(II[II)V',
  'glMaterialxv(IILjava/nio/IntBuffer;)V',
  'glMultMatrixf(Ljava/nio/FloatBuffer;)V',
  'glMultMatrixx([II)V',
  'glMultMatrixx(Ljava/nio/IntBuffer;)V',
  'glMultiTexCoord4f(IFFFF)V',
  'glMultiTexCoord4x(IIIII)V',
  'glNormalPointer(IILjava/nio/Buffer;)V',
  'glOrthox(IIIIII)V',
  'glPixelStorei(II)V',
  'glPointSize(F)V',
  'glPolygonOffset(FF)V',
  'glReadPixels(IIIIIILjava/nio/Buffer;)V',
  'glRotatex(IIII)V',
  'glSampleCoveragex(IZ)V',
  'glScalex(III)V',
  'glScissor(IIII)V',
  'glTexEnvfv(II[FI)V',
  'glTexEnvfv(IILjava/nio/FloatBuffer;)V',
  'glTexEnvxv(II[II)V',
  'glTexEnvxv(IILjava/nio/IntBuffer;)V',
  'glTexParameterf(IIF)V',
  'glTranslatex(III)V',
];

function glStubMethod(signature) {
  const returnType = signature.slice(signature.lastIndexOf(')') + 1);
  const hasArrayOut = /\[(I|F|J|B)/.test(signature);
  return (_self, args) => {
    if (hasArrayOut && Array.isArray(args)) {
      for (const arg of args) {
        const data = Array.isArray(arg?.$data) ? arg.$data : (Array.isArray(arg) ? arg : null);
        if (data) data.fill(0);
      }
    }
    switch (returnType) {
      case 'V': return undefined;
      case 'Z': return false;
      case 'I':
      case 'J':
      case 'F':
      case 'D':
      case 'B':
      case 'S':
      case 'C': return 0;
      case 'Ljava/lang/String;': return '';
      default: return null;
    }
  };
}

const GL_STUB_METHODS = Object.fromEntries(GL_STUB_SIGNATURES.map((signature) => [signature, glStubMethod(signature)]));

function createGlesClass(descriptor, extra = null) {
  return nativeDef(descriptor, {
    super: 'Ljava/lang/Object;',
    staticMethods: Object.assign({}, GL_STUB_METHODS, GLES_COMMON_METHODS, extra || {}),
  });
}

const GLSurfaceViewPeer = class {
  constructor(vm, object) {
    this.vm = vm;
    this.object = object;
    this.renderer = null;
    this.clientVersion = 1;
    this.renderMode = 0;
    this.debugFlags = 0;
    this.eglContextFactory = null;
    this.eglWindowSurfaceFactory = null;
    this.eglConfigChooser = null;
    this.glWrapper = null;
    this.preserveEGLContextOnPause = false;
    this.paused = false;
    this.$view = new View(vm.contextObject ?? null);
    this.$view.$descriptor = 'Landroid/opengl/GLSurfaceView;';
    this.$view.$javaObject = object;
    object.$view = this.$view;
  }
};

/** 取 GLSurfaceView 当前可用的 GL 实例（EGL 上下文或新建的 GL10 桩）。 */
function glSurfaceGl(self) {
  const vm = self.vm;
  const context = self.glWrapper?.wrapped ?? null;
  if (context) return context;
  if (vm?._eglContext?.gl) return vm._eglContext.gl;
  const created = eglContextObject(vm);
  return created?.$peer?.gl ?? created;
}

/** 通知渲染器绘制一帧（对应 GLSurfaceView 的 GLThread 绘制循环）。 */
function glSurfaceDrawFrame(self) {
  const vm = self.vm;
  if (!self.renderer || !vm) return;
  try {
    vm.invokeInterface(self.renderer, 'onDrawFrame', '(Ljavax/microedition/khronos/opengles/GL10;)V', [glSurfaceGl(self)]);
  } catch (_error) {
    void _error;
  }
}

/** 通知渲染器 Surface 尺寸变化。 */
function glSurfaceChanged(self, width, height) {
  const vm = self.vm;
  if (!self.renderer || !vm) return;
  try {
    vm.invokeInterface(self.renderer, 'onSurfaceChanged', '(Ljavax/microedition/khronos/opengles/GL10;II)V', [glSurfaceGl(self), width | 0, height | 0]);
  } catch (_error) {
    void _error;
  }
}

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
        const config = eglConfigObject(vm, 0);
        vm.invokeInterface(renderer, 'onSurfaceCreated', '(Ljavax/microedition/khronos/opengles/GL10;Ljavax/microedition/khronos/egl/EGLConfig;)V', [glSurfaceGl(self), config]);
        const [width, height] = [self.$view?.getWidth?.() || 0, self.$view?.getHeight?.() || 0];
        glSurfaceChanged(self, width, height);
      } catch (_error) {
        void _error;
      }
    },
    'setRenderMode(I)V': (self, [mode]) => { self.renderMode = toInt(mode); },
    'getRenderMode()I': (self) => self.renderMode | 0,
    'requestRender()V': (self) => { glSurfaceDrawFrame(self); },
    'queueEvent(Ljava/lang/Runnable;)V': (self, [runnable], vm) => {
      try {
        vm.invokeInterface(runnable, 'run', '()V', []);
      } catch (_error) {
        void _error;
      }
    },
    'onPause()V': (self) => {
      self.paused = true;
      if (!self.preserveEGLContextOnPause) {
        self.eglSurface = null;
        self.eglContext = null;
      }
    },
    'onResume()V': (self) => {
      self.paused = false;
      if (self.eglSurfaceCreated) glSurfaceDrawFrame(self);
    },
    'setEGLConfigChooser(IIIIII)V': (self, [red, green, blue, alpha, depth, stencil]) => {
      self.eglConfigChooser = { red, green, blue, alpha, depth, stencil };
    },
    'setEGLConfigChooser(Z)V': (self, [needDepth]) => {
      self.eglConfigChooser = { needDepth: !!needDepth };
    },
    'setEGLConfigChooser(Landroid/opengl/GLSurfaceView$EGLConfigChooser;)V': (self, [chooser]) => {
      self.eglConfigChooser = chooser ?? null;
    },
    'setDebugFlags(I)V': (self, [flags]) => { self.debugFlags = flags | 0; },
    'getDebugFlags()I': (self) => self.debugFlags | 0,
    'setGLWrapper(Landroid/opengl/GLSurfaceView$GLWrapper;)V': (self, [wrapper], vm) => {
      self.glWrapper = { wrapper, wrapped: null };
      if (!wrapper || !vm) return;
      try {
        const wrapped = vm.invokeInterface(wrapper, 'wrap', '(Ljavax/microedition/khronos/opengles/GL;)Ljavax/microedition/khronos/opengles/GL;', [glSurfaceGl(self)]);
        self.glWrapper = { wrapper, wrapped: wrapped ?? null };
      } catch (_error) {
        void _error;
      }
    },
    'setEGLContextFactory(Landroid/opengl/GLSurfaceView$EGLContextFactory;)V': (self, [factory]) => {
      self.eglContextFactory = factory ?? null;
    },
    'setEGLWindowSurfaceFactory(Landroid/opengl/GLSurfaceView$EGLWindowSurfaceFactory;)V': (self, [factory]) => {
      self.eglWindowSurfaceFactory = factory ?? null;
    },
    'getPreserveEGLContextOnPause()Z': (self) => (self.preserveEGLContextOnPause ? 1 : 0),
    'setPreserveEGLContextOnPause(Z)V': (self, [preserve]) => { self.preserveEGLContextOnPause = !!preserve; },
    'surfaceCreated(Landroid/view/SurfaceHolder;)V': (self, [holder]) => {
      self.surfaceHolder = holder ?? null;
      self.eglSurfaceCreated = true;
      self.eglContext = null;
      self.eglSurface = null;
      const vm = self.vm;
      if (!vm) return;
      const config = eglConfigObject(vm, 0);
      if (self.eglContextFactory) {
        try {
          self.eglContext = vm.invokeInterface(self.eglContextFactory, 'createContext', '(Ljavax/microedition/khronos/egl/EGL10;Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLConfig;)Ljavax/microedition/khronos/egl/EGLContext;',
            [vm._egl10 ?? null, vm._eglDisplay ?? null, config]) ?? null;
        } catch (_error) {
          void _error;
        }
      }
      if (self.eglWindowSurfaceFactory) {
        try {
          self.eglSurface = vm.invokeInterface(self.eglWindowSurfaceFactory, 'createWindowSurface', '(Ljavax/microedition/khronos/egl/EGL10;Ljavax/microedition/khronos/egl/EGLDisplay;Ljavax/microedition/khronos/egl/EGLConfig;Ljava/lang/Object;)Ljavax/microedition/khronos/egl/EGLSurface;',
            [vm._egl10 ?? null, vm._eglDisplay ?? null, config, holder ?? null]) ?? null;
        } catch (_error) {
          void _error;
        }
      }
      if (self.renderer) {
        try {
          vm.invokeInterface(self.renderer, 'onSurfaceCreated', '(Ljavax/microedition/khronos/opengles/GL10;Ljavax/microedition/khronos/egl/EGLConfig;)V', [glSurfaceGl(self), config]);
        } catch (_error) {
          void _error;
        }
      }
      const width = Number(self.$view?.getWidth?.() ?? self.surfaceWidth ?? 0);
      const height = Number(self.$view?.getHeight?.() ?? self.surfaceHeight ?? 0);
      glSurfaceChanged(self, width, height);
      glSurfaceDrawFrame(self);
    },
    'surfaceDestroyed(Landroid/view/SurfaceHolder;)V': (self) => {
      self.surfaceHolder = null;
      self.eglSurfaceCreated = false;
      self.eglSurface = null;
      self.eglContext = null;
    },
    'surfaceChanged(Landroid/view/SurfaceHolder;III)V': (self, [_holder, _format, width, height]) => {
      self.surfaceWidth = width | 0;
      self.surfaceHeight = height | 0;
      glSurfaceChanged(self, width | 0, height | 0);
      glSurfaceDrawFrame(self);
    },
    'surfaceRedrawNeeded(Landroid/view/SurfaceHolder;)V': (self) => {
      glSurfaceDrawFrame(self);
    },
    'surfaceRedrawNeededAsync(Landroid/view/SurfaceHolder;Ljava/lang/Runnable;)V': (self, [_holder, runnable], vm) => {
      glSurfaceDrawFrame(self);
      if (!runnable) return;
      try {
        vm.invokeInterface(runnable, 'run', '()V', []);
      } catch (_error) {
        void _error;
      }
    },
    'finalize()V': (self) => {
      self.renderer = null;
      self.eglSurfaceCreated = false;
      self.eglSurface = null;
      self.eglContext = null;
      self.finalized = true;
    },
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
    methods: Object.assign({}, GL_STUB_METHODS, GL10Methods),
  }),
  GLES20: createGlesClass('Landroid/opengl/GLES20;'),
  GLES30: createGlesClass('Landroid/opengl/GLES30;', GLES30_EXTRA_METHODS),
  GLSurfaceView,
  GLSurfaceViewRenderer: nativeDef('Landroid/opengl/GLSurfaceView$Renderer;', {
    super: 'Ljava/lang/Object;',
    interfaces: ['Landroid/opengl/GLSurfaceView$Renderer;'],
  }),
};
