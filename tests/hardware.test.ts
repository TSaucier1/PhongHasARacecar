// Feeds simulated serial bytes through the timer parsers. Run: tsx tests/hardware.test.ts
import assert from 'node:assert/strict';
import { TimerParser, elapsed } from '../src/server/hardware';

const bytes = (flag: number | string, digits: string) =>
  [typeof flag === 'string' ? flag.charCodeAt(0) : flag, ...digits.split('').map(c => c.charCodeAt(0))];
const collect = (p: TimerParser) => { const out: any[] = []; for (const k of ['start', 'finish', 'reset', 'clearstart', 'error', 'disconnected']) p.on(k, (v?: any) => out.push(v === undefined ? k : [k, v])); return out; };

// JA normal: 45.123 s is sent as reversed digits "321540"
{ const p = new TimerParser('jacircuits-normal'); const out = collect(p);
  p.push([...bytes(128, '321540'), 13, 10]); p.push([...bytes(128, '000000'), 13, 10]);
  assert.deepEqual(out, [['finish', 45123], 'reset']); }
// JA chrono with counter wrap-around, two cars on course, and split-up serial reads
{ const p = new TimerParser('jacircuits-chrono'); const out = collect(p);
  const data = [...bytes(65, '990000'), 13, 10, ...bytes(65, '995000'), 13, 10, ...bytes(66, '040000'), 13, 10, ...bytes(66, '046500'), 13, 10];
  p.push(data.slice(0, 7)); p.push(data.slice(7, 20)); p.push(data.slice(20));
  assert.deepEqual(out, ['start', 'start', ['finish', 50000], ['finish', 51500]]); }
// TLink: error code makes it ignore the next (bogus) start, duplicate start ignored, 9-digit wrap
{ const p = new TimerParser('tlink-direct'); const out = collect(p);
  const line = (s: string) => [...s].map(c => c.charCodeAt(0)).concat([13]);
  p.push([...line('A000100000'), ...line('A000100000'), ...line('AE10000000'), ...line('A000000001'), ...line('B000148250')]);
  assert.deepEqual(out, ['start', ['error', 'TLink error E1'], ['finish', 48250]]); }
assert.equal(elapsed(999999000, 1000, 9), 2000);
console.log('hardware parser tests passed');
