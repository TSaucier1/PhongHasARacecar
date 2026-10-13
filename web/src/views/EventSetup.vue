<template>
  <TopBar title="Event Setup" :back="`/event/${id}`" back-label="Event" />
  <div class="ax-page" v-if="form" style="max-width: 760px">
    <v-text-field v-model="form.name" label="Event name" />
    <div class="ax-row2">
      <v-text-field v-model="form.date" label="Date" type="date" />
      <v-text-field v-model="form.eventNumber" label="Event number" />
    </div>
    <v-text-field v-model="form.location" label="Location" />
    <v-switch v-model="form.countsForPoints" label="Counts for season points" color="primary" hide-details />

    <div class="ax-h2">Cone stations</div>
    <v-text-field v-model="stations" label="Station names, separated by commas" hint="Letters, numbers or names — e.g. A, B, C, D or Slalom, Box, Finish" persistent-hint />

    <div class="ax-h2">Run groups</div>
    <div v-for="(g, i) in form.runGroups" :key="i" class="ax-row3" style="grid-template-columns: 1fr 1fr 48px; align-items:center">
      <v-text-field v-model="g.name" label="Name" hide-details />
      <v-select v-model="g.color" :items="colors" label="Color" hide-details>
        <template #selection="{ item }"><span class="ax-dot" :style="{ background: item.value }"></span>&nbsp;{{ item.value }}</template>
      </v-select>
      <v-btn icon="mdi-delete" variant="text" @click="form.runGroups.splice(i, 1)" />
    </div>
    <v-btn variant="text" prepend-icon="mdi-plus" @click="form.runGroups.push({ name: '', color: 'red' })">Add run group</v-btn>

    <div class="ax-h2">Scoring rules</div>
    <div class="ax-row2">
      <v-text-field v-model.number="penaltySec" label="Seconds per cone" type="number" step="0.5" />
      <v-text-field v-model.number="form.rules.maxRuns" label="Counted runs per driver (0 = no limit)" type="number" />
    </div>
    <v-switch v-model="form.rules.countConesOnOffRuns" label="Count cones on off-course runs in a driver's cone total" color="primary" hide-details />
    <v-select v-model="form.rules.paxRounding" :items="[{ title: 'Truncate to 0.001 (original behavior)', value: 'truncate' }, { title: 'Round to nearest 0.001', value: 'round' }]" label="PAX time rounding" />
    <v-text-field v-model="paxExclude" label="Leave classes out of PAX results if their name contains" hint="Comma separated. Original: fun" persistent-hint />

    <div class="ax-row2" style="margin-top: 22px">
      <div class="ax-btn" @click="save"><span class="mdi mdi-content-save"></span>Save</div>
      <router-link :to="`/event/${id}`" class="ax-btn grey" style="text-decoration:none">Cancel</router-link>
    </div>
    <v-snackbar v-model="saved" color="success" timeout="1500">Saved — results recalculated</v-snackbar>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { api, state, watchEvent } from '../api';
const id = Number(useRoute().params.id);
watchEvent(id);
const form = ref<any>(null); const stations = ref(''); const penaltySec = ref(2); const paxExclude = ref(''); const saved = ref(false);
const colors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'black', 'white', 'gray', 'pink'];
watch(state, s => {
  if (!s || form.value) return;
  form.value = JSON.parse(JSON.stringify(s.event));
  stations.value = s.event.coneStations.join(', ');
  penaltySec.value = s.event.rules.conePenaltyMs / 1000;
  paxExclude.value = (s.event.rules.paxExcludeClassesContaining || []).join(', ');
}, { immediate: true });
async function save() {
  const f = form.value;
  f.coneStations = stations.value.split(',').map(s => s.trim()).filter(Boolean);
  f.rules.conePenaltyMs = Math.round(Number(penaltySec.value) * 1000);
  f.rules.maxRuns = Number(f.rules.maxRuns) || 0;
  f.rules.paxExcludeClassesContaining = paxExclude.value.split(',').map(s => s.trim()).filter(Boolean);
  f.runGroups = f.runGroups.filter((g: any) => g.name);
  await api('PUT', `/events/${id}`, f);
  saved.value = true;
}
</script>
