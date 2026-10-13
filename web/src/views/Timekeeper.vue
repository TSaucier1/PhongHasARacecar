<template>
  <TopBar title="Time Keeper" :back="`/event/${id}`" back-label="Event" strip live />
  <div class="ax-page" v-if="state">
    <div class="tk">
      <div>
        <div class="ax-row2">
          <div class="ax-btn" @click="groupDlg = true"><span class="mdi mdi-flag"></span>Start Session or Run Group</div>
          <div class="ax-btn" @click="picker = true"><span class="mdi mdi-plus"></span>Add Driver to Queue</div>
        </div>
        <div class="ax-muted" style="margin:8px 2px"><b>Session:</b> {{ state.event.currentSession }} &nbsp; <b>Run group:</b>
          <span class="ax-dot" :style="{ background: groupColor(state.event.currentRunGroup) }"></span> {{ state.event.currentRunGroup || 'none' }}</div>

        <div class="timer">
          <div style="font-weight:700;margin-bottom:6px"><span class="mdi mdi-timer-outline"></span> Timer
            <span class="ax-muted" style="font-weight:400;font-size:12px">— use when no timing hardware is connected, or to fix a missed trigger</span></div>
          <div class="ax-row3" style="grid-template-columns: 1fr 1.2fr 1fr">
            <div :class="{ disabled: !queued.length }" class="ax-btn green" @click="start">Car started</div>
            <input class="ax-search" v-model="manual" placeholder="Finish time e.g. 48.321" inputmode="decimal" @keyup.enter="finish()" />
            <div :class="{ disabled: !queue.length }" class="ax-btn" @click="finish()">Finish</div>
          </div>
          <div style="margin-top:6px"><a href="#" @click.prevent="finish(true)" class="ax-muted" style="font-size:12px">Simulate a finish with a random time</a></div>
        </div>

        <div class="ax-h2">In Queue <span class="ax-muted" style="font-size:14px">({{ queue.length }})</span></div>
        <div class="ax-list">
          <div v-if="!queue.length" class="ax-li dark">None</div>
          <div v-for="(r, i) in queue" :key="r.id" class="ax-li">
            <span class="ax-dot" :style="{ background: groupColor(reg(r).runGroup) }"></span>
            <span v-if="r.status === 'R'" class="ax-badge oncourse">ON COURSE</span>
            <div class="grow"><div class="name">{{ fullName(reg(r)) }}</div><div class="sub">{{ reg(r).className }} · {{ reg(r).car }}</div></div>
            <div class="ax-carnum sm">{{ reg(r).carNumber }}</div>
            <v-btn v-if="r.status === 'Q'" icon="mdi-arrow-up" size="small" variant="text" :disabled="i === 0 || queue[i - 1].status !== 'Q'" @click="move(i, -1)" />
            <v-btn icon="mdi-close" size="small" variant="text" color="error" @click="remove(r.id)" />
          </div>
        </div>
      </div>
      <div>
        <div class="ax-h2" style="margin-top:0">Recent Runs</div>
        <div class="ax-list">
          <div v-if="!finished.length" class="ax-li dark">No runs yet</div>
          <div v-for="r in finished.slice(0, 40)" :key="r.id" class="ax-li" @click="editing = r.id">
            <span class="ax-badge" :class="{ grey: !r.counted }">{{ r.driverRun }}</span>
            <div class="grow">
              <div class="name">{{ fullName(reg(r)) }}</div>
              <div class="time">{{ sec(r.rawMs) }} <span v-if="r.cones" class="ax-cones">+{{ r.cones }}</span>
                <span v-if="r.dnf" class="ax-flag">DNF</span><span v-if="r.off" class="ax-flag">OFF</span><span v-if="r.rerun" class="ax-flag grey">RERUN</span></div>
            </div>
            <div class="ax-carnum sm">{{ reg(r).className }} {{ reg(r).carNumber }}</div>
            <span class="mdi mdi-chevron-right ax-chev"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <DriverPicker v-model="picker" />
  <RunEditor :run-id="editing" @close="editing = null" />
  <v-dialog v-model="groupDlg" max-width="420">
    <v-card title="Start Session or Run Group">
      <v-card-text>
        <v-text-field v-model.number="session" label="Session" type="number" />
        <div style="display:grid;gap:8px">
          <div v-for="g in state?.event.runGroups" :key="g.name" class="ax-btn grey" @click="setGroup(g.name)">
            <span class="ax-dot" :style="{ background: g.color }"></span> {{ g.name }}</div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import RunEditor from '../components/RunEditor.vue';
import DriverPicker from '../components/DriverPicker.vue';
import { api, state, watchEvent, queue, finished, regById, fullName, sec, groupColor } from '../api';
import type { RunRow } from '@shared/types';
const id = Number(useRoute().params.id);
watchEvent(id);
const picker = ref(false); const editing = ref<number | null>(null); const manual = ref(''); const groupDlg = ref(false); const session = ref(1);
const reg = (r: RunRow) => regById.value.get(r.registrationId)!;
const queued = computed(() => queue.value.filter(r => r.status === 'Q'));
const start = () => api('POST', `/events/${id}/timer/start`, { source: 'manual' });
async function finish(random = false) {
  const ms = random ? 45000 + Math.floor(Math.random() * 12000) : Math.round(parseFloat(manual.value) * 1000);
  if (!(ms > 0)) return;
  await api('POST', `/events/${id}/timer/finish`, { rawMs: ms, source: random ? 'simulated' : 'manual' });
  manual.value = '';
}
async function move(i: number, d: number) {
  const ids = queued.value.map(r => r.id); const offset = queue.value.length - queued.value.length; const j = i - offset;
  [ids[j], ids[j + d]] = [ids[j + d], ids[j]];
  await api('POST', `/events/${id}/queue/order`, { runIds: ids });
}
const remove = (runId: number) => api('DELETE', `/events/${id}/runs/${runId}`);
async function setGroup(g: string) { await api('POST', `/events/${id}/current`, { runGroup: g, session: session.value }); groupDlg.value = false; }
</script>
<style scoped>
.tk { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.timer { background: #fff; border: 1px solid var(--ax-line); padding: 10px; margin-top: 12px; }
@media (max-width: 860px) { .tk { grid-template-columns: 1fr; } }
</style>
