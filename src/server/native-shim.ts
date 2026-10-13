// Replaces 'node-gyp-build' inside the bundled app. In the single-file .exe the serial-port native module is an
// embedded asset: write it to a temp folder once and load it from there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export default function load(_dir: string): any {
  let sea: any = null;
  try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch { sea = null; }
  if (!sea) {
    // Bundle run with plain node (e.g. during testing): fall back to the installed package.
    const real = require(path.join(process.cwd(), 'node_modules', 'node-gyp-build'));
    return real(path.join(process.cwd(), 'node_modules', '@serialport', 'bindings-cpp'));
  }
  const buf = Buffer.from(sea.getRawAsset('serialport.node'));
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const dir = path.join(os.tmpdir(), 'axtime-next');
  const file = path.join(dir, `serialport-${hash}.node`);
  if (!fs.existsSync(file)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, buf); }
  const mod: any = { exports: {} };
  process.dlopen(mod, file);
  return mod.exports;
}
