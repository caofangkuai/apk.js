/**
 * 文件 IO / 正则宿主补全回归：RandomAccessFile 原始类型、File 元数据、
 * PrintWriter 文件落盘与 Matcher 替换都必须落到真实状态。
 */
import assert from 'node:assert/strict';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';
import { JAVA_CORE_CLASSES, VIRTUAL_FS } from '../src/framework/java-core.js';

const vm = new JavaVM({});
registerFrameworkNativeClasses(vm);
for (const cls of Object.values(JAVA_CORE_CLASSES)) vm.registry.registerNative(cls);

const call = (object, key, args = []) => {
  const name = key.slice(0, key.indexOf('('));
  const proto = key.slice(key.indexOf('('));
  return vm.invokeByName(name, proto, object, args);
};
const stat = (descriptor, key, args) => vm.registry.resolve(descriptor).nativeDef.staticMethods.get(key)(null, args, vm);
const readFloat = (bits) => {
  const ints = new Int32Array(1);
  ints[0] = bits;
  return new Float32Array(ints.buffer)[0];
};

/* 1. RandomAccessFile 原始类型往返 */
const raf = vm.instantiate('Ljava/io/RandomAccessFile;', ['/tmp/raf.bin', 'rw']);
call(raf, 'writeInt(I)V', [0x01020304]);
call(raf, 'writeLong(J)V', [5n]);
call(raf, 'writeUTF(Ljava/lang/String;)V', ['hé']);
call(raf, 'writeFloat(F)V', [1.5]);
call(raf, 'writeBoolean(Z)V', [1]);
const endPointer = Number(call(raf, 'getFilePointer()J'));
assert.equal(endPointer, 4 + 8 + 5 + 4 + 1, '写入后文件指针应推进实际字节数（UTF 含 2 字节长度）');
call(raf, 'seek(J)V', [0n]);
assert.equal(call(raf, 'readInt()I'), 0x01020304);
assert.equal(call(raf, 'readLong()J'), 5n);
assert.equal(call(raf, 'readUTF()Ljava/lang/String;'), 'hé');
assert.equal(readFloat(call(raf, 'readFloat()F')), 1.5);
assert.equal(call(raf, 'readBoolean()Z'), 1);
assert.equal(Number(call(raf, 'getFilePointer()J')), endPointer, '读取后指针到达末尾');

/* 2. File 元数据、重命名与权限 */
VIRTUAL_FS.write('/tmp/dir/one.txt', []);
VIRTUAL_FS.write('/tmp/dir/two.bin', []);
const dir = vm.instantiate('Ljava/io/File;', ['/tmp/dir']);
const names = call(dir, 'list()[Ljava/lang/String;').$data;
assert.deepEqual([...names].sort(), ['one.txt', 'two.bin']);
const children = call(dir, 'listFiles()[Ljava/io/File;').$data;
assert.equal(children.length, 2);

const source = vm.instantiate('Ljava/io/File;', ['/tmp/dir/one.txt']);
const destination = vm.instantiate('Ljava/io/File;', ['/tmp/dir/renamed.txt']);
assert.equal(call(source, 'renameTo(Ljava/io/File;)Z', [destination]), 1, 'renameTo 应真实移动文件');
assert.equal(VIRTUAL_FS.exists('/tmp/dir/renamed.txt'), true);
assert.equal(VIRTUAL_FS.exists('/tmp/dir/one.txt'), false);
assert.equal(call(destination, 'setReadOnly()Z'), 1);
assert.equal(call(destination, 'canWrite()Z'), 0, 'setReadOnly 后 canWrite 为 false');
assert.equal(call(destination, 'canRead()Z'), 1);
assert.equal(call(destination, 'setExecutable(Z)Z', [true]), 1);
assert.equal(call(destination, 'canExecute()Z'), 1);
assert.equal(call(destination, 'isAbsolute()Z'), 1);

const temp = stat('Ljava/io/File;', 'createTempFile(Ljava/lang/String;Ljava/lang/String;)Ljava/io/File;', ['pre', '.tmp']);
assert.equal(call(temp, 'exists()Z'), 1, 'createTempFile 应真实创建文件');
assert.equal(call(temp, 'delete()Z'), 1);

/* 3. PrintWriter 写入虚拟文件并格式化 */
const writer = vm.instantiate('Ljava/io/PrintWriter;', ['/tmp/print.txt']);
call(writer, 'println(Ljava/lang/String;)V', ['line1']);
const formatArgs = vm.newArray('[Ljava/lang/Object;', 1, null);
formatArgs.$data[0] = 'x';
call(writer, 'printf(Ljava/lang/String;[Ljava/lang/Object;)Ljava/io/PrintWriter;', ['%s!', formatArgs]);
const written = new TextDecoder().decode(VIRTUAL_FS.read('/tmp/print.txt'));
assert.equal(written, 'line1\nx!');
call(writer, 'setError()V');
assert.equal(call(writer, 'checkError()Z'), 1);
call(writer, 'clearError()V');
assert.equal(call(writer, 'checkError()Z'), 0);

/* 4. Matcher 分组索引、区域与替换 */
const pattern = stat('Ljava/util/regex/Pattern;', 'compile(Ljava/lang/String;)Ljava/util/regex/Pattern;', ['(\\w+)-(\\w+)']);
const matcher = call(pattern, 'matcher(Ljava/lang/CharSequence;)Ljava/util/regex/Matcher;', ['ab-cd ef-gh']);
assert.equal(call(matcher, 'find()Z'), 1);
assert.equal(call(matcher, 'group(I)Ljava/lang/String;', [1]), 'ab');
assert.equal(call(matcher, 'start(I)I', [1]), 0);
assert.equal(call(matcher, 'end(I)I', [1]), 2);
assert.equal(call(matcher, 'find()Z'), 1);
assert.equal(call(matcher, 'group()Ljava/lang/String;'), 'ef-gh');
assert.equal(call(matcher, 'start()I'), 6);

call(matcher, 'reset()Ljava/util/regex/Matcher;');
call(matcher, 'region(II)Ljava/util/regex/Matcher;', [6, 11]);
assert.equal(call(matcher, 'find()Z'), 1);
assert.equal(call(matcher, 'start()I'), 6, 'region 内匹配应返回绝对偏移');

call(matcher, 'reset(Ljava/lang/CharSequence;)Ljava/util/regex/Matcher;', ['ab-cd ef-gh']);
const buffer = vm.instantiate('Ljava/lang/StringBuffer;', []);
call(matcher, 'find()Z');
call(matcher, 'appendReplacement(Ljava/lang/StringBuffer;Ljava/lang/String;)Ljava/util/regex/Matcher;', [buffer, '$2:$1']);
call(matcher, 'appendTail(Ljava/lang/StringBuffer;)Ljava/lang/StringBuffer;', [buffer]);
assert.equal(call(buffer, 'toString()Ljava/lang/String;'), 'cd:ab ef-gh', 'appendReplacement 应展开分组并保留尾部');
assert.equal(stat('Ljava/util/regex/Matcher;', 'quoteReplacement(Ljava/lang/String;)Ljava/lang/String;', ['$1\\a']), '\\$1\\\\a');

console.log('java-io OK');
