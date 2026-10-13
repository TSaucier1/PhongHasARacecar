<template>
  <TopBar title="Raw Times / Run Log" :back="`/event/${id}`" back-label="Event" strip live />
  <div class="ax-page" v-if="state">
    <input class="ax-search" v-model="q" placeholder="Filter by car # or name" />
    <div class="ax-list" style="margin-top:10px">
      <div v-for="r in rows" :key="r.id" class="ax-li" @click="editing = r.id">
        <span class="ax-muted" style="width:38px;text-align:right">{{ r.seq }}</span>
        <span class="ax-badge" :class="{ grey: !r.counted }">{{ r.driverRun }}</span>
        <div class="grow">
          <div class="name">#{{ reg(r).carNumber }} {{ fullName(reg(r)) }} <span class="ax-muted" style="font-weight:400">{{ reg(r).className }}</span></div>
          <div class="sub">{{ r.finishedAt ? new Date(r.finishedAt).toLocaleTimeString() : '' }} · session {{ r.session }}
            <template v-if="r.coneHits.length"> · cones {{ r.coneHits.map(h => (h.station || 'n/a') + ':' + h.cones).join(', ') }}</template></div>
        </div>
        <div style="text-align:right">
          <div class="time">{{ sec(r.rawMs) }} <span v-if="r.cones" class="ax-cones">+{{ r.cones }}</span></div>
          <div class="sub">total {{ sec(r.totalMs) }} · PAX {{ sec(r.paxMs) }}
            <span v-if="r.dnf" class="ax-flag">DNF</span><span v-if="r.off" class="ax-flag">OFF</span><span v-if="r.rerun" class="ax-flag grey">RERUN</span></div>
        </div>
      </div>
    </div>
  </div>
  <RunEditor :run-id="editing" @close="editing = null" />
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import RunEditor from '../components/RunEditor.vue';
import { state, watchEvent, finished, regById, fullName, sec } from '../api';
import type { RunRow } from '@shared/types';
const id = Number(useRoute().params.id);
watchEvent(id);
const q = ref(''); const editing = ref<number | null>(null);
const reg = (r: RunRow) => regById.value.get(r.registrationId)!;
const rows = computed(() => finished.value.filter(r => !q.value || `${reg(r).carNumber} ${fullName(reg(r))}`.toLowerCase().includes(q.value.toLowerCase())));
</script>
