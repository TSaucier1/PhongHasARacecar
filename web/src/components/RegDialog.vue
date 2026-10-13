<template>
  <v-dialog :model-value="!!modelValue" @update:model-value="v => !v && close()" max-width="640">
    <v-card v-if="f">
      <v-card-title>{{ f.id ? 'Edit Registration' : 'Register a Driver' }}</v-card-title>
      <v-card-text>
        <v-autocomplete v-if="!f.id" v-model="picked" :items="members" item-title="label" return-object v-model:search="search" no-filter
          label="Find a member (name or number)" prepend-inner-icon="mdi-magnify" clearable hide-no-data />
        <div class="ax-row2">
          <v-text-field v-model="f.firstName" label="First name" />
          <v-text-field v-model="f.lastName" label="Last name" />
        </div>
        <div class="ax-row2">
          <v-text-field v-model="f.carNumber" label="Car number" />
          <v-autocomplete v-model="f.className" :items="classes" item-title="label" item-value="name" label="Class" />
        </div>
        <div class="ax-row2">
          <v-text-field v-model="f.car" label="Car (year make model)" />
          <v-text-field v-model="f.carColor" label="Color" />
        </div>
        <v-select v-model="f.runGroup" :items="groups" label="Run group" />
        <div style="display:flex;gap:18px;flex-wrap:wrap">
          <v-checkbox v-model="f.checkedIn" label="Checked in" hide-details />
          <v-checkbox v-model="f.teched" label="Tech'd" hide-details />
          <v-checkbox v-model="f.paid" label="Paid" hide-details />
          <v-checkbox v-model="f.isRookie" label="Rookie" hide-details />
        </div>
        <div v-if="dup" class="ax-flag" style="margin-top:8px">Car #{{ f.carNumber }} is already used in {{ f.className }} by {{ dup }}</div>
      </v-card-text>
      <v-card-actions class="px-6 pb-4" style="gap:10px">
        <div :class="{ disabled: !f.firstName || !f.carNumber || !f.className }" class="ax-btn" @click="save">Save</div>
        <div class="ax-btn grey" @click="close">Cancel</div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api, state, fullName } from '../api';
const props = defineProps<{ modelValue: any; eventId: number }>();
const emit = defineEmits(['update:modelValue']);
const f = ref<any>(null); const search = ref(''); const members = ref<any[]>([]); const picked = ref<any>(null); const classes = ref<any[]>([]);
const groups = computed(() => state.value?.event.runGroups.map(g => g.name) || []);
const dup = computed(() => {
  const d = state.value?.registrations.find(r => r.id !== f.value?.id && r.carNumber === f.value?.carNumber && r.className === f.value?.className);
  return d ? fullName(d) : '';
});
watch(() => props.modelValue, async v => {
  f.value = v ? { checkedIn: true, ...JSON.parse(JSON.stringify(v)) } : null; picked.value = null;
  if (v && !classes.value.length && state.value)
    classes.value = (await api<any[]>('GET', `/seasons/${state.value.event.seasonYear}/classes`)).map(c => ({ ...c, label: `${c.name}${c.paxIndex !== 1 ? ' (' + c.paxIndex + ')' : ''}` }));
}, { immediate: true });
let t: any;
watch(search, q => { clearTimeout(t); if (!q || q.length < 2) return; t = setTimeout(async () => {
  members.value = (await api<any[]>('GET', `/members?q=${encodeURIComponent(q)}`)).map(m => ({ ...m, label: `${m.firstName} ${m.lastName}${m.dedicatedNumber ? ' #' + m.dedicatedNumber : ''}${m.lastClass ? ' · ' + m.lastClass : ''}` }));
}, 200); });
watch(picked, m => {
  if (!m) return;
  const car = (m.cars || [])[m.cars.length - 1] || {};
  Object.assign(f.value, { memberId: m.id, firstName: m.firstName, lastName: m.lastName, carNumber: m.dedicatedNumber || f.value.carNumber,
    className: m.lastClass || f.value.className, car: car.description || [car.year, car.make, car.model].filter(Boolean).join(' '), carColor: car.color || '' });
});
function close() { emit('update:modelValue', null); }
async function save() { await api('POST', `/events/${props.eventId}/registrations`, f.value); close(); }
</script>
