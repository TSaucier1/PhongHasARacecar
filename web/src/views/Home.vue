<template>
  <TopBar title="Chesapeake Region PCA" />
  <div class="ax-page">
    <div class="ax-row2" style="max-width: 520px">
      <div class="ax-btn" @click="create"><span class="mdi mdi-plus"></span>New Event</div>
      <router-link to="/hardware" class="ax-btn grey" style="text-decoration:none"><span class="mdi mdi-timer-cog-outline"></span>Timing Hardware</router-link>
    </div>
    <div class="ax-h2">Events</div>
    <input class="ax-search" v-model="q" placeholder="Filter events…" style="margin-bottom:10px" />
    <div class="ax-list">
      <router-link v-for="e in shown" :key="e.id" :to="`/event/${e.id}`" class="ax-li" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div class="name">{{ e.name }}</div>
          <div class="sub">{{ usDate(e.date) }} · {{ e.location || 'No location' }}</div>
        </div>
        <div class="sub" style="text-align:right">{{ e.drivers }} drivers<br />{{ e.runs }} runs</div>
        <span class="mdi mdi-chevron-right ax-chev"></span>
      </router-link>
    </div>
    <p class="ax-muted" style="margin-top:14px;font-size:12px">AXtime Next {{ info?.version }} · data in {{ info?.dataDir }}</p>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { api } from '../api';
const events = ref<any[]>([]); const info = ref<any>(null); const q = ref('');
const router = useRouter();
const shown = computed(() => events.value.filter(e => !q.value || `${e.name} ${e.date} ${e.location}`.toLowerCase().includes(q.value.toLowerCase())));
const usDate = (d: string) => { const [y, m, dd] = d.split('-'); return `${m}/${dd}/${y}`; };
onMounted(async () => { events.value = await api('GET', '/events'); info.value = await api('GET', '/info'); });
async function create() { const r = await api<{ id: number }>('POST', '/events', { name: 'New Event' }); router.push(`/event/${r.id}/setup`); }
</script>
