<template>
  <div class="lr">
    <TopBar title="Live Results" :back="`/event/${id}`" back-label="Event" live />
    <div class="ax-page" v-if="state" style="padding-bottom:70px">
      <div class="ax-row3">
        <div class="ax-btn" :class="{ on: mode === 'raw' }" @click="mode = 'raw'">Raw Time</div>
        <div class="ax-btn" :class="{ on: mode === 'class' }" @click="mode = 'class'">Class</div>
        <div class="ax-btn" :class="{ on: mode === 'pax' }" @click="mode = 'pax'">PAX</div>
      </div>
      <div style="text-align:center;margin:8px 0;font-weight:700">Times update automatically · {{ runCount }} runs · Updated {{ updated }}</div>
      <input class="ax-search" v-model="q" placeholder="Filter by car # or name" />
      <template v-for="g in groups" :key="g.name">
        <div v-if="mode === 'class'" class="ax-h2" style="font-size:16px">{{ g.name }} <span class="ax-muted" style="font-size:12px">({{ g.rows.length }})</span></div>
        <div class="ax-list" :style="{ marginTop: mode === 'class' ? '0' : '10px' }">
          <div v-for="r in g.rows" :key="r.id" class="ax-li" @click="detail = r.id">
            <div class="ax-rank">{{ rankOf(r) || '–' }}<small>{{ r.result.rankOverall || '-' }}-{{ r.result.rankClass || '-' }}-{{ r.result.rankPax || '-' }}</small></div>
            <div class="grow">
              <div class="name">{{ fullName(r) }}</div>
              <div class="time">{{ sec(timeOf(r)) }} <span v-if="diffOf(r).total > 0" class="ax-diff">+{{ sec(diffOf(r).total) }} <small>+{{ sec(diffOf(r).prev) }}</small></span></div>
              <div class="sub">DNFs: {{ r.result.dnfs }}, Re-runs: {{ r.result.reruns }}, Cones: {{ r.result.cones }}<br />{{ r.className }}</div>
            </div>
            <div class="ax-carnum">{{ r.carNumber }}</div>
            <span class="mdi mdi-chevron-right ax-chev"></span>
          </div>
        </div>
      </template>
    </div>
    <v-dialog :model-value="!!detail" @update:model-value="v => !v && (detail = null)" max-width="480">
      <v-card v-if="dreg">
        <v-card-title>#{{ dreg.carNumber }} {{ fullName(dreg) }}</v-card-title>
        <v-card-subtitle>{{ dreg.className }} · {{ dreg.car }}</v-card-subtitle>
        <v-card-text>
          <div class="ax-list">
            <div v-for="r in druns" :key="r.id" class="ax-li" style="min-height:44px;cursor:default">
              <span class="ax-badge" :class="{ grey: !r.counted }">{{ r.driverRun }}</span>
              <div class="grow time" :style="{ fontWeight: r.totalMs === dreg.result.bestMs && r.clean ? 800 : 400 }">
                {{ sec(r.rawMs) }} <span v-if="r.cones" class="ax-cones">+{{ r.cones }}</span>
                <span v-if="r.dnf" class="ax-flag">DNF</span><span v-if="r.off" class="ax-flag">OFF</span><span v-if="r.rerun" class="ax-flag grey">RERUN</span></div>
              <div class="sub">PAX {{ sec(r.paxMs) }}</div>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { state, watchEvent, fullName, sec } from '../api';
import type { RegistrationRow } from '@shared/types';
const id = Number(useRoute().params.id);
watchEvent(id);
const mode = ref<'raw' | 'class' | 'pax'>('raw'); const q = ref(''); const detail = ref<number | null>(null);
const runCount = computed(() => state.value?.runs.filter(r => r.status === 'F').length ?? 0);
const updated = computed(() => state.value ? new Date(state.value.generatedAt).toLocaleTimeString() : '');
const rankOf = (r: RegistrationRow) => (mode.value === 'raw' ? r.result.rankOverall : mode.value === 'pax' ? r.result.rankPax : r.result.rankClass);
const timeOf = (r: RegistrationRow) => (mode.value === 'pax' ? r.result.bestPaxMs : mode.value === 'class' && r.paxClass ? r.result.bestPaxMs : r.result.bestMs);
const diffOf = (r: RegistrationRow) => mode.value === 'raw' ? { total: r.result.diffOverallMs, prev: r.result.diffPrevOverallMs }
  : mode.value === 'pax' ? { total: r.result.diffPaxMs, prev: r.result.diffPrevPaxMs } : { total: r.result.diffClassMs, prev: r.result.diffPrevClassMs };
const order = (a: RegistrationRow, b: RegistrationRow) => (rankOf(a) || 9999) - (rankOf(b) || 9999) || a.lastName.localeCompare(b.lastName);
const groups = computed(() => {
  const regs = (state.value?.registrations || []).filter(r => r.result.totalRuns > 0 || rankOf(r))
    .filter(r => !q.value || `${r.carNumber} ${fullName(r)}`.toLowerCase().includes(q.value.toLowerCase()));
  if (mode.value !== 'class') return [{ name: '', rows: regs.slice().sort(order) }];
  const m = new Map<string, RegistrationRow[]>();
  for (const r of regs) { const k = r.result.classGroup; m.set(k, [...(m.get(k) || []), r]); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, rows]) => ({ name, rows: rows.sort(order) }));
});
const dreg = computed(() => state.value?.registrations.find(r => r.id === detail.value));
const druns = computed(() => (state.value?.runs || []).filter(r => r.registrationId === detail.value && r.status === 'F').sort((a, b) => a.seq - b.seq));
</script>
