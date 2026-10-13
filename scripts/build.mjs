// Builds the release: the web app, one bundled server file, and single-file executables for Windows and Linux.
//   node scripts/build.mjs            -> dist/release/AXtimeNext.exe and dist/release/axtime-next (linux)
// Needs: npm install, data/seed.db (scripts/build-seed.ts), and internet access to npm for the Node runtimes (cached in .cache/).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const NODE_VERSION = '22.23.3';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (...p) => path.join(root, ...p);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });

const TARGETS = {
  'win-x64':   { pkg: 'node-win-x64',   bin: 'bin/node.exe', out: 'AXtimeNext.exe', serial: 'win32-x64/@serialport+bindings-cpp.node' },
  'linux-x64': { pkg: 'node-linux-x64', bin: 'bin/node',     out: 'axtime-next',    serial: 'linux-x64/@serialport+bindings-cpp.glibc.node' },
};
const wanted = process.argv.slice(2).filter(a => TARGETS[a]);
const targets = wanted.length ? wanted : Object.keys(TARGETS);

function nodeRuntime(pkg) {
  const dir = r('.cache', pkg);
  if (!fs.existsSync(path.join(dir, 'package'))) {
    fs.mkdirSync(r('.cache'), { recursive: true });
    run('npm', ['pack', `${pkg}@${NODE_VERSION}`, '--silent'], { cwd: r('.cache') });
    fs.mkdirSync(dir, { recursive: true });
    run('tar', ['xzf', `${pkg}-${NODE_VERSION}.tgz`, '-C', dir], { cwd: r('.cache') });
  }
  return path.join(dir, 'package');
}

console.log('1/3 web app');
run('npx', ['vite', 'build']);

console.log('2/3 server bundle');
fs.rmSync(r('dist', 'bundle'), { recursive: true, force: true });
await build({
  entryPoints: [r('src', 'server', 'main.ts')], bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  outfile: r('dist', 'bundle', 'server.cjs'), alias: { 'node-gyp-build': r('src', 'server', 'native-shim.ts') },
  external: ['node:sea'], logLevel: 'warning', legalComments: 'none',
  // node:sqlite is stable in practice but still prints an "experimental" notice; don't alarm people running the event.
  banner: { js: "process.removeAllListeners('warning'); process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w.name + ': ' + w.message); });" },
});

console.log('3/3 executables');
const webFiles = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : webFiles.push(p); } })(r('dist', 'web'));
const hostNode = path.join(nodeRuntime('node-linux-x64'), 'bin', 'node'); // generates the blob (same Node version as targets)
fs.mkdirSync(r('dist', 'release'), { recursive: true });
for (const t of targets) {
  const T = TARGETS[t];
  const assets = { 'serialport.node': r('node_modules', '@serialport', 'bindings-cpp', 'prebuilds', T.serial) };
  // Starter data is optional: without data/seed.db the app starts with an empty database.
  if (fs.existsSync(r('data', 'seed.db'))) assets['seed.db'] = r('data', 'seed.db');
  for (const f of webFiles) assets['web/' + path.relative(r('dist', 'web'), f).split(path.sep).join('/')] = f;
  const cfg = r('dist', `sea-${t}.json`), blob = r('dist', `sea-${t}.blob`);
  fs.writeFileSync(cfg, JSON.stringify({ main: r('dist', 'bundle', 'server.cjs'), output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false, assets }, null, 1));
  run(hostNode, ['--experimental-sea-config', cfg]);
  const out = r('dist', 'release', T.out);
  fs.copyFileSync(path.join(nodeRuntime(T.pkg), T.bin), out);
  run('npx', ['postject', out, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', '--overwrite']);
  if (!out.endsWith('.exe')) fs.chmodSync(out, 0o755);
  console.log(`   ${out}  (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}
