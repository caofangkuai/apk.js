process.on('uncaughtException', () => {});
import { VIRTUAL_FS, readFsText } from './src/framework/java-core.js';
import { seedHardwareFs } from './src/framework/java-core.js';
seedHardwareFs();
for (const p of ['/sys/block/sda/device/model','/proc/scsi/scsi','/sys/block/mmcblk0/device/model']) {
  console.log(p, '=>', JSON.stringify(readFsText(p)));
}
