<template>
  <v-dialog :model-value="!!run" @update:model-value="v => !v && emit('close')" max-width="520">
    <v-card v-if="run && reg">
      <v-card-title>#{{ reg.carNumber }} {{ fullName(reg) }} <span class="ax-muted" style="font-size:14px">· {{ reg.className }} · run {{ run.driverRun || '-' }}</span></v-card-title>
      <v-card-text>
        <div class="ax-row2" style="align-items:center">
          <v-text-field v-model="raw" label="Raw time (seconds)" inputmode="decimal" hide-details />
          <div class="ax-btn" @click="saveTime">Set time</div>
        </div>
        <div style="margin:14px 0 6px;font-weight:700">Cones: {{ run.cones }} <span class="ax-muted">({{ hitsText }})</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <v-btn v-for="s in stations" :key="s" size="small" :color="station === s ? 'primary' : 'grey-lighten-2'" @click="station = s" class="ax-station">{{ s || 'n/a' }}</v-btn>
        </div>
        <div class="ax-row2" style="margin-top:8px">
          <div class="ax-btn red" @click="cone(1)">+1 cone {{ station ? '@ ' + station : '' }}</div>
          <div class="ax-btn grey" @click="cone(-1)">−1 cone</div>
        </div>
        <div class="ax-row3" style="margin-top:14px">
          <div class="ax-btn grey" :class="{ on: run.dnf }" @click="flag('dnf')">DNF</div>
          <div class="ax-btn grey" :class="{ on: run.off }" @click="flag('off')">Off Course</div>
          <div class="ax-btn grey" :class="{ on: run.rerun }" @click="flag('rerun')">Re-run</div>
        </div>
      </v-card-text>
      <v-card-actions class="px-6 pb-4" style="gap:10px">
        <div class="ax-btn red" @click="del">Delete run</div>
        <div class="ax-btn grey" @click="emit('close')">Done</div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api, state, regById, fullName } from '../api';
const props = defineProps<{ runId: number | null }>();
const emit = defineEmits(['close']);
const run = computed(() => state.value?.runs.find(r => r.id === props.runId) || null);
const reg = computed(() => (run.value ? regById.value.get(run.value.registrationId) : undefined));
const stations = computed(() => ['', ...(state.value?.event.coneStations || [])]);
const station = ref('');
const raw = ref('');
watch(() => props.runId, () => { raw.value = run.value?.rawMs ? (run.value.rawMs / 1000).toFixed(3) : ''; station.value = ''; }, { immediate: true });
const hitsText = computed(() => run.value?.coneHits.map(h => `${h.station || 'n/a'}: ${h.cones}`).join(', ') || 'none');
const base = () => `/events/${state.value!.event.id}/runs/${props.runId}`;
const saveTime = () => api('PUT', base(), { rawMs: Math.round(parseFloat(raw.value) * 1000) || 0 });
const cone = (d: number) => api('POST', base() + '/cones', { station: station.value, delta: d });
const flag = (k: 'dnf' | 'off' | 'rerun') => api('PUT', base(), { [k]: !run.value![k] });
async function del() { if (confirm('Delete this run?')) { await api('DELETE', base()); emit('close'); } }
</script>
