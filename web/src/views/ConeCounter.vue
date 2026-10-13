<template>
  <TopBar title="Cone Counter" :back="`/event/${id}`" back-label="Event" strip live />
  <div class="ax-page" v-if="state">
    <div class="ax-muted" style="margin-bottom:8px;font-size:13px">Tap a car to call cones. Yellow = on course, blue = in queue, white = finished.</div>
    <div class="ax-cc-grid">
      <div v-for="r in tiles" :key="r.id" class="ax-cc" :class="{ oncourse: r.status === 'R', done: r.status === 'F' }" @click="open(r.id)">
        <div class="cls">{{ reg(r).className }}</div>
        <div class="num">#{{ reg(r).carNumber }}</div>
        <div class="who">{{ fullName(reg(r)) }}</div>
        <div class="c">
          <template v-if="r.cones">+{{ r.cones }} cone{{ r.cones > 1 ? 's' : '' }}</template>
          <span v-if="r.dnf">DNF</span><span v-if="r.off"> OFF</span><span v-if="r.rerun"> RERUN</span>&nbsp;
        </div>
      </div>
      <div v-if="!tiles.length" class="ax-cc done" style="grid-column: 1 / -1"><div class="who" style="padding:24px">No cars queued or running yet</div></div>
    </div>
  </div>

  <v-dialog v-model="dlg" max-width="460">
    <v-card v-if="run">
      <v-card-title>#{{ reg(run).carNumber }} {{ fullName(reg(run)) }}</v-card-title>
      <v-card-subtitle>{{ reg(run).className }} · cones so far: {{ run.cones }} {{ run.coneHits.length ? '(' + run.coneHits.map(h => (h.station || 'n/a') + ':' + h.cones).join(', ') + ')' : '' }}</v-card-subtitle>
      <v-card-text>
        <div style="font-weight:700;margin-bottom:6px">Which station?</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <v-btn v-for="s in stations" :key="s" size="large" class="ax-station" :color="station === s ? 'primary' : 'grey-lighten-2'" @click="pickStation(s)">{{ s || 'n/a' }}</v-btn>
        </div>
        <div class="ax-row2" style="margin-top:14px">
          <div class="ax-btn red" style="min-height:56px;font-size:18px" @click="cone(1)">+1 Cone</div>
          <div class="ax-btn grey" style="min-height:56px" @click="cone(-1)">Remove 1</div>
        </div>
        <div class="ax-row3" style="margin-top:12px">
          <div class="ax-btn grey" :class="{ on: run.dnf }" @click="flag('dnf')">DNF</div>
          <div class="ax-btn grey" :class="{ on: run.off }" @click="flag('off')">Off Course</div>
          <div class="ax-btn grey" :class="{ on: run.rerun }" @click="flag('rerun')">Re-run</div>
        </div>
      </v-card-text>
      <v-card-actions class="px-6 pb-4"><div class="ax-btn grey" @click="dlg = false">Done</div></v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { api, state, watchEvent, queue, finished, regById, fullName } from '../api';
import type { RunRow } from '@shared/types';
const id = Number(useRoute().params.id);
watchEvent(id);
const reg = (r: RunRow) => regById.value.get(r.registrationId)!;
const tiles = computed(() => [...queue.value.slice(0, 6), ...finished.value.slice(0, 10)]);
const stations = computed(() => [...(state.value?.event.coneStations || []), '']);
const dlg = ref(false); const runId = ref<number | null>(null);
let lastStation = '';
const station = ref('');
const run = computed(() => state.value?.runs.find(r => r.id === runId.value) || null);
function open(rid: number) { runId.value = rid; station.value = lastStation; dlg.value = true; }
function pickStation(s: string) { station.value = s; lastStation = s; }
const base = () => `/events/${id}/runs/${runId.value}`;
const cone = (d: number) => api('POST', base() + '/cones', { station: station.value, delta: d });
const flag = (k: 'dnf' | 'off' | 'rerun') => api('PUT', base(), { [k]: !run.value![k] });
</script>
