/**
 * JDK 核心类宿主补全回归（Objects/Comparator/Set/Map/Reader/TimeZone/Package/System/URI）。
 *
 * 断言点都落在真实状态上：数组比较、函数式回调、Map 键值变更、Reader 游标、
 * Intl 时区偏移、URI 组件解析与相对地址计算。
 */
import assert from 'node:assert/strict';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';
import { JAVA_CORE_CLASSES } from '../src/framework/java-core.js';

const vm = new JavaVM({});
registerFrameworkNativeClasses(vm);
for (const cls of Object.values(JAVA_CORE_CLASSES)) vm.registry.registerNative(cls);

const stat = (descriptor, key, args) => {
  const definition = vm.registry.resolve(descriptor).nativeDef;
  return definition.staticMethods.get(key)(null, args, vm);
};
const call = (object, key, args = []) => {
  const name = key.slice(0, key.indexOf('('));
  const proto = key.slice(key.indexOf('('));
  return vm.invokeByName(name, proto, object, args);
};
const intArray = (values) => vm.newArray('[I', values.length, values);
const objectArray = (values) => vm.newArray('[Ljava/lang/Object;', values.length, values);
const unbox = (value) => (value?.$peer && typeof value.$peer.value === 'number' ? value.$peer.value : value);

/* 1. Objects：数组深比较、hash、空值回退与越界检查 */
const left = objectArray([1, intArray([2, 3])]);
const right = objectArray([1, intArray([2, 3])]);
assert.equal(stat('Ljava/util/Objects;', 'deepEquals(Ljava/lang/Object;Ljava/lang/Object;)Z', [left, right]), 1);
assert.equal(stat('Ljava/util/Objects;', 'deepEquals(Ljava/lang/Object;Ljava/lang/Object;)Z',
  [left, objectArray([1, intArray([2, 4])])]), 0);
assert.equal(stat('Ljava/util/Objects;', 'isNull(Ljava/lang/Object;)Z', [null]), 1);
assert.equal(stat('Ljava/util/Objects;', 'nonNull(Ljava/lang/Object;)Z', [left]), 1);
assert.equal(stat('Ljava/util/Objects;', 'requireNonNullElse(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;',
  [null, 'fallback']), 'fallback');
assert.throws(
  () => stat('Ljava/util/Objects;', 'checkIndex(II)I', [3, 3]),
  /out of bounds/,
  'checkIndex 必须在越界时抛异常'
);
assert.equal(stat('Ljava/util/Objects;', 'checkFromIndexSize(III)I', [2, 3, 5]), 2);
assert.notEqual(
  stat('Ljava/util/Objects;', 'hash([Ljava/lang/Object;)I', [left]),
  stat('Ljava/util/Objects;', 'hash([Ljava/lang/Object;)I', [objectArray([1, 2])])
);

/* 2. Comparator：自然序、空值策略、comparing + thenComparing 组合 */
const natural = stat('Ljava/util/Comparator;', 'naturalOrder()Ljava/util/Comparator;', []);
assert.ok(Number(call(natural, 'compare(Ljava/lang/Object;Ljava/lang/Object;)I', [1, 2])) < 0);
const reverse = stat('Ljava/util/Comparator;', 'reverseOrder()Ljava/util/Comparator;', []);
assert.ok(Number(call(reverse, 'compare(Ljava/lang/Object;Ljava/lang/Object;)I', [1, 2])) > 0);
const nullsFirst = stat('Ljava/util/Comparator;', 'nullsFirst(Ljava/util/Comparator;)Ljava/util/Comparator;', [natural]);
assert.equal(Number(call(nullsFirst, 'compare(Ljava/lang/Object;Ljava/lang/Object;)I', [null, 5])), -1);

const byLength = stat('Ljava/util/Comparator;', 'comparingInt(Ljava/util/function/ToIntFunction;)Ljava/util/Comparator;', [
  { applyAsInt: (value) => String(value).length },
]);
const byText = stat('Ljava/util/Comparator;', 'comparing(Ljava/util/function/Function;)Ljava/util/Comparator;', [
  { apply: (value) => String(value) },
]);
const combined = call(byLength, 'thenComparing(Ljava/util/Comparator;)Ljava/util/Comparator;', [byText]);
assert.ok(Number(call(combined, 'compare(Ljava/lang/Object;Ljava/lang/Object;)I', ['bb', 'a'])) > 0);
assert.ok(Number(call(combined, 'compare(Ljava/lang/Object;Ljava/lang/Object;)I', ['a', 'b'])) < 0);

/* 3. Set.of：去重且不可修改，copyOf 复用集合内容 */
const ofSet = stat('Ljava/util/Set;', 'of([Ljava/lang/Object;)Ljava/util/Set;', [objectArray(['a', 'b', 'a'])]);
assert.equal(Number(call(ofSet, 'size()I')), 2);
assert.equal(Number(call(ofSet, 'contains(Ljava/lang/Object;)Z', ['b'])), 1);
assert.equal(Number(call(ofSet, 'containsAll(Ljava/util/Collection;)Z', [stat('Ljava/util/Set;',
  'of([Ljava/lang/Object;)Ljava/util/Set;', [objectArray(['a'])])])), 1);
assert.throws(() => call(ofSet, 'add(Ljava/lang/Object;)Z', ['c']), /immutable set/);
const mutableSet = vm.allocateRawObject('Ljava/util/Set;');
mutableSet.$peer = { setItems: ['a', 'b', 'c'] };
assert.equal(Number(call(mutableSet, 'retainAll(Ljava/util/Collection;)Z', [stat('Ljava/util/Set;',
  'of([Ljava/lang/Object;)Ljava/util/Set;', [objectArray(['a', 'c'])])])), 1);
assert.equal(Number(call(mutableSet, 'size()I')), 2);
assert.equal(Number(call(mutableSet, 'retainAll(Ljava/util/Collection;)Z', [stat('Ljava/util/Set;',
  'of([Ljava/lang/Object;)Ljava/util/Set;', [objectArray(['a', 'c'])])])), 0);

/* 4. HashMap：条件删除/替换/compute/merge/forEach/replaceAll 都作用于真实 Map */
const map = vm.instantiate('Ljava/util/HashMap;', []);
call(map, 'put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', ['a', 1]);
call(map, 'put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', ['b', 2]);
assert.equal(Number(call(map, 'remove(Ljava/lang/Object;Ljava/lang/Object;)Z', ['a', 9])), 0);
assert.equal(Number(call(map, 'remove(Ljava/lang/Object;Ljava/lang/Object;)Z', ['a', 1])), 1);
assert.equal(unbox(call(map, 'replace(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', ['b', 3])), 2);
assert.equal(Number(call(map, 'replace(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Z', ['b', 3, 4])), 1);
assert.equal(unbox(call(map, 'computeIfAbsent(Ljava/lang/Object;Ljava/util/function/Function;)Ljava/lang/Object;', [
  'c',
  { apply: (key) => key.toUpperCase() },
])), 'C');
assert.equal(unbox(call(map, 'merge(Ljava/lang/Object;Ljava/lang/Object;Ljava/util/function/BiFunction;)Ljava/lang/Object;', [
  'b',
  10,
  { apply: (oldValue, value) => oldValue + value },
])), 14);
const seen = [];
call(map, 'forEach(Ljava/util/function/BiConsumer;)V', [{ accept: (key, value) => seen.push([key, value]) }]);
assert.deepEqual(seen.map(([key]) => key).sort(), ['b', 'c']);
call(map, 'replaceAll(Ljava/util/function/BiFunction;)V', [{ apply: (key, value) => `${key}:${value}` }]);
assert.equal(jsString(call(map, 'get(Ljava/lang/Object;)Ljava/lang/Object;', ['c'])), 'c:C');
assert.equal(call(map, 'compute(Ljava/lang/Object;Ljava/util/function/BiFunction;)Ljava/lang/Object;', [
  'c',
  () => null,
]), null);
assert.equal(Number(call(map, 'containsKey(Ljava/lang/Object;)Z', ['c'])), 0);

function jsString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value.$string !== undefined) return value.$string;
  return value?.$peer?.text ?? String(value);
}

/* 5. Reader：游标推进、跳过、mark/reset 与 ready */
const reader = vm.instantiate('Ljava/io/StringReader;', ['hello world']);
assert.equal(Number(call(reader, 'read()I')), 'h'.charCodeAt(0));
assert.equal(Number(call(reader, 'skip(J)J', [5n])), 5);
assert.equal(call(reader, 'ready()Z'), 1);
call(reader, 'mark(I)V', [100]);
assert.equal(Number(call(reader, 'read()I')), 'w'.charCodeAt(0));
call(reader, 'reset()V', []);
assert.equal(Number(call(reader, 'read()I')), 'w'.charCodeAt(0));
const chars = vm.newArray('[C', 5, 0);
assert.equal(Number(call(reader, 'read([CII)I', [chars, 1, 3])), 3);
assert.equal(String.fromCharCode(...chars.$data.slice(1, 4)), 'orl');
assert.equal(Number(call(reader, 'markSupported()Z')), 1);

/* 6. TimeZone：固定偏移与 IANA 偏移都来自真实时区规则 */
const shanghai = stat('Ljava/util/TimeZone;', 'getTimeZone(Ljava/lang/String;)Ljava/util/TimeZone;', ['Asia/Shanghai']);
assert.equal(Number(call(shanghai, 'getRawOffset()I')), 8 * 3600 * 1000);
assert.equal(Number(call(shanghai, 'getOffset(J)I', [0n])), 8 * 3600 * 1000);
assert.equal(Number(call(shanghai, 'observesDaylightTime()Z')), 0);
const fixed = stat('Ljava/util/TimeZone;', 'getTimeZone(Ljava/lang/String;)Ljava/util/TimeZone;', ['GMT+05:30']);
assert.equal(Number(call(fixed, 'getRawOffset()I')), 5.5 * 3600 * 1000);
assert.equal(Number(call(shanghai, 'hasSameRules(Ljava/util/TimeZone;)Z', [fixed])), 0);
const zoneId = call(shanghai, 'toZoneId()Ljava/time/ZoneId;');
assert.equal(call(zoneId, 'getId()Ljava/lang/String;'), 'Asia/Shanghai');
const available = stat('Ljava/util/TimeZone;', 'getAvailableIDs()[Ljava/lang/String;', []);
assert.ok(available.$data.includes('UTC'));

/* 7. URI：组件解析、百分号解码、normalize/resolve/relativize */
const uri = vm.instantiate('Ljava/net/URI;', ['https://user@Example.com:8443/a/b/../c%20d?q=1#frag']);
assert.equal(call(uri, 'getScheme()Ljava/lang/String;'), 'https');
assert.equal(call(uri, 'getHost()Ljava/lang/String;'), 'Example.com');
assert.equal(Number(call(uri, 'getPort()I')), 8443);
assert.equal(call(uri, 'getPath()Ljava/lang/String;'), '/a/b/../c d');
assert.equal(call(uri, 'getRawPath()Ljava/lang/String;'), '/a/b/../c%20d');
assert.equal(call(uri, 'getQuery()Ljava/lang/String;'), 'q=1');
assert.equal(call(uri, 'getFragment()Ljava/lang/String;'), 'frag');
assert.equal(call(uri, 'getUserInfo()Ljava/lang/String;'), 'user');
assert.equal(Number(call(uri, 'isAbsolute()Z')), 1);
assert.equal(call(uri, 'normalize()Ljava/net/URI;').$peer.text, 'https://user@example.com:8443/a/c%20d?q=1#frag');
const resolved = call(uri, 'resolve(Ljava/lang/String;)Ljava/net/URI;', ['../x?y=2']);
assert.equal(resolved.$peer.text, 'https://user@Example.com:8443/x?y=2');
const base = vm.instantiate('Ljava/net/URI;', ['https://example.com/a/b/c']);
const target = vm.instantiate('Ljava/net/URI;', ['https://example.com/a/d']);
assert.equal(call(base, 'relativize(Ljava/net/URI;)Ljava/net/URI;', [target]).$peer.text, '../d');
const opaque = vm.instantiate('Ljava/net/URI;', ['mailto:someone@example.com']);
assert.equal(Number(call(opaque, 'isOpaque()Z')), 1);
assert.equal(call(opaque, 'getSchemeSpecificPart()Ljava/lang/String;'), 'someone@example.com');
const content = vm.instantiate('Ljava/net/URI;', ['content://media/external/images/1']);
assert.equal(call(content, 'getAuthority()Ljava/lang/String;'), 'media');
assert.equal(call(content, 'getPath()Ljava/lang/String;'), '/external/images/1');

/* 8. Package：缓存实例并携带包名 */
const pkg = stat('Ljava/lang/Package;', 'getPackage(Ljava/lang/String;)Ljava/lang/Package;', ['com.example']);
assert.equal(call(pkg, 'getName()Ljava/lang/String;'), 'com.example');
assert.equal(
  stat('Ljava/lang/Package;', 'getPackage(Ljava/lang/String;)Ljava/lang/Package;', ['com.example']).$peer,
  pkg.$peer,
  'getPackage 应命中同一个缓存实例'
);
assert.equal(Number(call(pkg, 'isSealed()Z')), 0);
assert.equal(Number(stat('Ljava/lang/Package;', 'getPackages()[Ljava/lang/Package;', []).$data.length), 1);

/* 9. System：属性读写、清空与环境、库名映射 */
assert.equal(stat('Ljava/lang/System;', 'getProperty(Ljava/lang/String;)Ljava/lang/String;', ['file.separator']), '/');
assert.equal(stat('Ljava/lang/System;', 'setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;',
  ['demo.key', 'demo-value']), null);
assert.equal(stat('Ljava/lang/System;', 'getProperty(Ljava/lang/String;)Ljava/lang/String;', ['demo.key']), 'demo-value');
assert.equal(stat('Ljava/lang/System;', 'clearProperty(Ljava/lang/String;)Ljava/lang/String;', ['demo.key']), 'demo-value');
assert.equal(stat('Ljava/lang/System;', 'getProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;',
  ['demo.key', 'fallback']), 'fallback');
const properties = stat('Ljava/lang/System;', 'getProperties()Ljava/util/Properties;', []);
assert.equal(call(properties, 'getProperty(Ljava/lang/String;)Ljava/lang/String;', ['os.name']), 'Linux');
assert.equal(stat('Ljava/lang/System;', 'mapLibraryName(Ljava/lang/String;)Ljava/lang/String;', ['crypto']), 'libcrypto.so');
const env = stat('Ljava/lang/System;', 'getenv()Ljava/util/Map;', []);
assert.ok(env?.$peer?.map instanceof Map);
assert.throws(
  () => stat('Ljava/lang/System;', 'loadLibrary(Ljava/lang/String;)V', ['missing']),
  /dlopen failed/
);

/* 10. Properties：set/get/默认值与 entrySet */
const props = vm.instantiate('Ljava/util/Properties;', []);
call(props, 'setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;', ['alpha', '1']);
assert.equal(call(props, 'getProperty(Ljava/lang/String;)Ljava/lang/String;', ['alpha']), '1');
assert.equal(Number(call(props, 'size()I')), 1);
assert.equal(Number(call(props, 'containsKey(Ljava/lang/Object;)Z', ['alpha'])), 1);
assert.equal(Number(call(props, 'entrySet()Ljava/util/Set;').$peer.setItems.length), 1);
const xmlOut = { $peer: { data: new Uint8Array() } };
call(props, 'storeToXML(Ljava/io/OutputStream;Ljava/lang/String;)V', [xmlOut, 'demo']);
const xmlText = new TextDecoder().decode(xmlOut.$peer.data);
assert.match(xmlText, /<entry key="alpha">1<\/entry>/);
const xmlIn = {
  $peer: { data: new TextEncoder().encode('<properties><entry key="beta">2</entry></properties>') },
};
call(props, 'loadFromXML(Ljava/io/InputStream;)V', [xmlIn]);
assert.equal(call(props, 'getProperty(Ljava/lang/String;)Ljava/lang/String;', ['beta']), '2');
call(props, 'load(Ljava/io/Reader;)V', [vm.instantiate('Ljava/io/StringReader;', ['gamma=3\n'])]);
assert.equal(call(props, 'getProperty(Ljava/lang/String;)Ljava/lang/String;', ['gamma']), '3');
assert.equal(Number(call(props, 'size()I')), 3);

/* 11. Random.nextBytes：确定性填充给定字节数组 */
const random = vm.instantiate('Ljava/util/Random;', [12345n]);
const bytesA = vm.newArray('[B', 8, 0);
const bytesB = vm.newArray('[B', 8, 0);
call(random, 'nextBytes([B)V', [bytesA]);
const randomAgain = vm.instantiate('Ljava/util/Random;', [12345n]);
call(randomAgain, 'nextBytes([B)V', [bytesB]);
assert.deepEqual([...bytesA.$data], [...bytesB.$data], '相同种子应产生相同字节');
assert.ok(bytesA.$data.some((value) => value !== 0), 'nextBytes 应写入真实随机字节');

/* 12. AbstractList：基于真实元素数组的增删改查与哈希 */
const abstractList = vm.instantiate('Ljava/util/AbstractList;', []);
assert.equal(call(abstractList, 'add(Ljava/lang/Object;)Z', ['x']), 1);
call(abstractList, 'add(ILjava/lang/Object;)V', [0, 'y']);
assert.equal(call(abstractList, 'get(I)Ljava/lang/Object;', [0]), 'y');
assert.equal(call(abstractList, 'set(ILjava/lang/Object;)Ljava/lang/Object;', [1, 'z']), 'x');
assert.equal(Number(call(abstractList, 'indexOf(Ljava/lang/Object;)I', ['z'])), 1);
assert.equal(Number(call(abstractList, 'size()I')), 2);
assert.equal(Number(call(abstractList, 'hashCode()I')), 31 * (31 + 'y'.charCodeAt(0)) + 'z'.charCodeAt(0));
assert.equal(call(abstractList, 'remove(I)Ljava/lang/Object;', [0]), 'y');
assert.equal(Number(call(abstractList, 'size()I')), 1);

/* 13. Arrays.spliterator：区间切分视图与遍历 */
const intSpliterator = stat('Ljava/util/Arrays;', 'spliterator([III)Ljava/util/Spliterator$OfInt;',
  [intArray([1, 2, 3, 4, 5]), 1, 4]);
const seenNumbers = [];
call(intSpliterator, 'forEachRemaining(Ljava/util/function/Consumer;)V', [
  { accept: (value) => seenNumbers.push(value) },
]);
assert.deepEqual(seenNumbers, [2, 3, 4]);
assert.equal(Number(call(intSpliterator, 'getExactSizeIfKnown()J')), 0);

/* 14. ThreadLocalRandom：边界内的真实随机值 */
const tlr = vm.allocateRawObject('Ljava/util/concurrent/ThreadLocalRandom;');
tlr.$peer = { seed: 987654 };
const bounded = Number(call(tlr, 'nextInt(II)I', [10, 20]));
assert.ok(bounded >= 10 && bounded < 20);
const boundedLong = call(tlr, 'nextLong(J)J', [5n]);
assert.ok(boundedLong >= 0n && boundedLong < 5n);
assert.ok(Number(call(tlr, 'nextDouble(DD)D', [1, 2])) >= 1);

/* 15. ReentrantReadWriteLock：读写锁计数与线程持有状态 */
const rwlock = vm.instantiate('Ljava/util/concurrent/locks/ReentrantReadWriteLock;', []);
const readLock = call(rwlock, 'readLock()Ljava/util/concurrent/locks/ReentrantReadWriteLock$ReadLock;');
const writeLock = call(rwlock, 'writeLock()Ljava/util/concurrent/locks/ReentrantReadWriteLock$WriteLock;');
call(readLock, 'lock()V');
assert.equal(Number(call(readLock, 'getHoldCount()I')), 1);
assert.equal(Number(call(rwlock, 'getReadLockCount()I')), 1);
call(readLock, 'unlock()V');
assert.equal(Number(call(rwlock, 'getReadLockCount()I')), 0);
call(writeLock, 'lock()V');
assert.equal(Number(call(rwlock, 'isWriteLocked()Z')), 1);
assert.equal(Number(call(writeLock, 'isHeldByCurrentThread()Z')), 1);
assert.equal(Number(call(rwlock, 'getWriteHoldCount()I')), 1);
call(writeLock, 'unlock()V');
assert.equal(Number(call(rwlock, 'isWriteLocked()Z')), 0);

/* 16. Instant：纳秒精度运算、截断、解析与周期差 */
const instant = stat('Ljava/time/Instant;', 'ofEpochSecond(JJ)Ljava/time/Instant;', [1500n, 250000000n]);
assert.equal(call(instant, 'getEpochSecond()J'), 1500n);
assert.equal(Number(call(instant, 'getNano()I')), 250000000);
const plusInstant = call(instant, 'plusNanos(J)Ljava/time/Instant;', [1000000000n]);
assert.equal(call(plusInstant, 'getEpochSecond()J'), 1501n);
const truncatedInstant = call(instant, 'truncatedTo(Ljava/time/temporal/TemporalUnit;)Ljava/time/Instant;', [
  { id: 'MILLIS' },
]);
assert.equal(Number(call(truncatedInstant, 'getNano()I')), 250000000);
const parsed = stat('Ljava/time/Instant;', 'parse(Ljava/lang/CharSequence;)Ljava/time/Instant;',
  ['2020-01-02T03:04:05.123456789Z']);
assert.equal(call(parsed, 'getEpochSecond()J'), BigInt(Date.UTC(2020, 0, 2, 3, 4, 5) / 1000));
assert.equal(Number(call(parsed, 'getNano()I')), 123456789);
const range = call(instant, 'range(Ljava/time/temporal/TemporalField;)Ljava/time/temporal/ValueRange;', [
  { id: 'NANO_OF_SECOND' },
]);
assert.equal(call(range, 'getMaximum()J'), 999999999n);
assert.equal(Number(call(instant, 'isSupported(Ljava/time/temporal/TemporalField;)Z', [{ id: 'INSTANT_SECONDS' }])), 1);
assert.equal(call(instant, 'until(Ljava/time/temporal/Temporal;Ljava/time/temporal/TemporalUnit;)J', [
  parsed,
  { id: 'SECONDS' },
]), ((BigInt(Date.UTC(2020, 0, 2, 3, 4, 5) / 1000) - 1500n) * 1000000000n + 123456789n - 250000000n) / 1000000000n);

console.log('jdk-core OK');
