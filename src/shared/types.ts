import type { EventRules, RegResult } from './scoring';

export interface RunGroup { name: string; color: string }

export interface EventInfo {
  id: number;
  name: string;
  date: string;
  seasonYear: number;
  location: string;
  eventNumber: string;
  countsForPoints: boolean;
  runGroups: RunGroup[];
  coneStations: string[];
  rules: EventRules;
  currentRunGroup: string;
  currentSession: number;
}

export interface RegistrationRow {
  id: number;
  memberId: number | null;
  firstName: string;
  lastName: string;
  carNumber: string;
  car: string;
  carColor: string;
  className: string;
  paxClass: string;
  paxIndex: number;
  isLadies: boolean;
  runGroup: string;
  checkedIn: boolean;
  teched: boolean;
  paid: boolean;
  isRookie: boolean;
  workerRole: string;
  result: RegResult;
}

export interface RunRow {
  id: number;
  registrationId: number;
  seq: number;
  session: number;
  status: 'Q' | 'R' | 'F';
  queuePos: number;
  rawMs: number;
  cones: number;
  dnf: boolean;
  rerun: boolean;
  off: boolean;
  finishedAt: string | null;
  coneHits: { station: string; cones: number }[];
  totalMs: number;
  paxMs: number;
  driverRun: number;
  counted: boolean;
  clean: boolean;
}

export interface EventState {
  event: EventInfo;
  registrations: RegistrationRow[];
  runs: RunRow[];
  generatedAt: string;
}
