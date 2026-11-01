globalThis.navigator = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140',
  platform: 'Linux x86_64',
  language: 'zh-CN',
  hardwareConcurrency: 12,
  deviceMemory: 16,
  maxTouchPoints: 5,
};
const { deviceCapabilities } = await import('./src/framework/java-core.js').catch(() => ({}));
import('./src/framework/registry.js').then(({ systemProperty }) => {
  console.log('ro.product.locale =', systemProperty('ro.product.locale'));
  console.log('ro.product.device =', systemProperty('ro.product.device'));
});
