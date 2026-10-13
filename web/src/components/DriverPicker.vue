<template>
  <v-dialog :model-value="modelValue" @update:model-value="v => emit('update:modelValue', v)" max-width="560" scrollable>
    <v-card>
      <v-card-title>Add Driver to Queue</v-card-title>
      <div class="px-4"><input class="ax-search" v-model="q" placeholder="Car # or name" ref="box" @keyup.enter="first && pick(first.id)" /></div>
      <div class="px-4 pt-2" style="display:flex;gap:6px;flex-wrap:wrap">
        <v-chip v-for="g in groups" :key="g" :color="g === group ? 'primary' : undefined" @click="group = group === g ? '' : g" size="small">
          <span class="ax-dot" :style="{ background: groupColor(g) }"></span>&nbsp;{{ g }}</v-chip>
      </div>
      <v-card-text style="max-height: 60vh">
        <div class="ax-list">
          <div v-for="r in list" :key="r.id" class="ax-li" @click="pick(r.id)">
            <span class="ax-dot" :style="{ background: groupColor(r.runGroup) }"></span>
            <div class="grow"><div class="name">{{ fullName(r) }}</div><div class="sub">{{ r.className }} · {{ r.car }} · {{ r.result.totalRuns }} runs</div></div>
            <div class="ax-carnum sm">{{ r.carNumber }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { api, state, fullName, groupColor } from '../api';
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(['update:modelValue']);
const q = ref(''); const group = ref(''); const box = ref<HTMLInputElement>();
const groups = computed(() => state.value?.event.runGroups.map(g => g.name) || []);
watch(() => props.modelValue, v => { if (v) { q.value = ''; group.value = state.value?.event.currentRunGroup || ''; nextTick(() => box.value?.focus()); } });
const list = computed(() => (state.value?.registrations || [])
  .filter(r => r.checkedIn && (!group.value || r.runGroup === group.value))
  .filter(r => !q.value || r.carNumber === q.value || `${r.carNumber} ${fullName(r)}`.toLowerCase().includes(q.value.toLowerCase()))
  .sort((a, b) => (a.carNumber === q.value ? -1 : b.carNumber === q.value ? 1 : a.result.totalRuns - b.result.totalRuns || Number(a.carNumber) - Number(b.carNumber))));
const first = computed(() => list.value[0]);
async function pick(regId: number) { await api('POST', `/events/${state.value!.event.id}/queue`, { registrationId: regId }); q.value = ''; box.value?.focus(); }
</script>
