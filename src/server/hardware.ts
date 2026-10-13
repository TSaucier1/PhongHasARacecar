// Timing hardware over a serial port. Byte formats ported from the original AXtime RM (lib/hardwareEvents.js).
//
//  JA Circuits Normal  - finish time only:     128 d d d d d d 13 10   (6 digits, reversed, ms)   128 000000 = reset
//  JA Circuits Chrono  - start/finish stamps:  65 dddddd 13 10 start   66 dddddd 13 10 finish     83 = clear start
//  RaceAmerica TLink Z - "A" + 9 digits + CR start, "B" + 9 digits + CR finish, "Z..." battery, "AE1..." errors
//  248 at any point     = hardware disconnected
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export type TimerType = 'jacircuits-normal' | 'jacircuits-chrono' | 'tlink-direct';
export const TIMER_TYPES: { id: TimerType; label: string }[] = [
  { id: 'jacircuits-normal', label: 'JA Circuits / FarmTek - Normal (finish times only)' },
  { id: 'jacircuits-chrono', label: 'JA Circuits / FarmTek - Chrono (start + finish)' },
  { id: 'tlink-direct', label: 'RaceAmerica TLink direct to Z' },
];

/** Elapsed time between two free-running counter stamps that wrap around at 10^digits. */
export function elapsed(start: number, finish: number, digits: number): number {
  const wrap = 10 ** digits;
  return finish >= start ? finish - start : finish + (wrap - start);
}

/** Turns raw serial bytes into start / finish(ms) / reset / disconnect events. Pure: no I/O, easy to test. */
export class TimerParser extends EventEmitter {
  private pack: number[] = [];
  private starts: string[] = [];
  private ignoreNextStart = false;
  private lastStartStamp = '';
  constructor(public type: TimerType) { super(); }

  onCourse() { return this.starts.length; }

  push(bytes: Uint8Array | number[]) {
    for (const b of bytes) {
      if (b === 248) { this.pack = []; this.starts = []; this.emit('disconnected'); continue; }
      if (this.type === 'tlink-direct') {
        if (b === 13) { this.handleTlink(String.fromCharCode(...this.pack)); this.pack = []; }
        else if (b !== 10) this.pack.push(b);
      } else {
        this.pack.push(b);
        if (b === 10) {
          const p = this.pack; this.pack = [];
          if (p.length === 9) this.handleJa(p); else this.emit('noise', p);
        }
      }
    }
  }

  private handleJa(p: number[]) {
    const digits = String.fromCharCode(...p.slice(1, 7));
    const flag = p[0];
    if (this.type === 'jacircuits-normal' || flag === 128) {
      if (flag !== 128) return this.emit('noise', p);
      const stamp = digits.split('').reverse().join('');
      if (stamp === '000000') return this.emit('reset');
      if (this.type === 'jacircuits-normal') return this.emit('finish', parseInt(stamp, 10));
      return; // in chrono mode the 128 packet just echoes the finish we already computed
    }
    if (flag === 65) { this.starts.push(digits); return this.emit('start'); }
    if (flag === 66) {
      const s = this.starts.shift();
      if (s === undefined) return this.emit('noise', p);
      return this.emit('finish', elapsed(parseInt(s, 10), parseInt(digits, 10), 6));
    }
    if (flag === 83) { this.starts.pop(); return this.emit('clearstart'); }
    this.emit('noise', p);
  }

  private handleTlink(line: string) {
    if (line.length !== 10) return;
    const flag = line[0], stamp = line.slice(1);
    if (flag === 'A') {
      if (stamp.startsWith('E')) { this.ignoreNextStart = true; return this.emit('error', `TLink error ${stamp.slice(0, 2)}`); }
      if (this.ignoreNextStart) { this.ignoreNextStart = false; return; }
      if (!/^\d+$/.test(stamp) || parseInt(stamp, 10) === 0) return; // power cycle etc.
      if (stamp === this.lastStartStamp) return;                    // duplicate after an error
      this.lastStartStamp = stamp; this.starts.push(stamp); this.emit('start');
    } else if (flag === 'B') {
      if (!/^\d+$/.test(stamp)) return this.emit('error', `TLink error ${stamp.slice(0, 2)}`);
      const s = this.starts.shift();
      if (s !== undefined) this.emit('finish', elapsed(parseInt(s, 10), parseInt(stamp, 10), stamp.length));
    } else if (flag === 'Z') this.emit('battery', stamp);
  }
}

interface HwConfig { enabled: boolean; port: string; type: TimerType }

export class Hardware extends EventEmitter {
  private cfg: HwConfig = { enabled: false, port: '', type: 'jacircuits-normal' };
  private sp: any = null;
  private parser: TimerParser | null = null;
  private lastError = '';
  private connected = false;
  private cfgFile: string;

  constructor(dataDir: string) {
    super();
    this.cfgFile = path.join(dataDir, 'hardware.json');
    try { this.cfg = { ...this.cfg, ...JSON.parse(fs.readFileSync(this.cfgFile, 'utf8')) }; } catch { /* first run */ }
    if (this.cfg.enabled) this.open().catch(() => { /* reported in status */ });
  }

  status() { return { ...this.cfg, connected: this.connected, lastError: this.lastError, types: TIMER_TYPES }; }

  private serialport(): any {
    try { return require('serialport'); }
    catch (e: any) { this.lastError = 'Serial support unavailable: ' + e.message; return null; }
  }

  async listPorts() {
    const mod = this.serialport();
    if (!mod) return [];
    try { return (await mod.SerialPort.list()).map((p: any) => ({ path: p.path, label: [p.path, p.manufacturer].filter(Boolean).join(' - ') })); }
    catch (e: any) { this.lastError = e.message; return []; }
  }

  async configure(input: Partial<HwConfig>) {
    this.cfg = { ...this.cfg, ...input } as HwConfig;
    fs.writeFileSync(this.cfgFile, JSON.stringify(this.cfg, null, 1));
    await this.close();
    if (this.cfg.enabled) await this.open();
  }

  private async close() {
    if (this.sp) await new Promise(r => this.sp.close(() => r(null)));
    this.sp = null; this.connected = false;
  }

  private async open() {
    const mod = this.serialport();
    if (!mod || !this.cfg.port) { this.lastError = this.lastError || 'No serial port selected'; return; }
    this.parser = new TimerParser(this.cfg.type);
    this.parser.on('start', () => this.emit('start'));
    this.parser.on('finish', (ms: number) => this.emit('finish', ms));
    this.parser.on('disconnected', () => { this.lastError = 'Timer reported disconnected'; });
    this.parser.on('error', (m: string) => { this.lastError = m; });
    await new Promise<void>(resolve => {
      this.sp = new mod.SerialPort({ path: this.cfg.port, baudRate: 9600 }, (err: any) => {
        if (err) { this.lastError = err.message; this.connected = false; } else { this.lastError = ''; this.connected = true; }
        resolve();
      });
      this.sp.on('data', (buf: Buffer) => this.parser!.push(buf));
      this.sp.on('close', () => { this.connected = false; });
      this.sp.on('error', (e: any) => { this.lastError = e.message; });
    });
  }
}
