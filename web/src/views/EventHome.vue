<template>
  <TopBar :title="state?.event.name || 'Event'" live />
  <div class="ax-page" v-if="state">
    <div class="ax-info">
      <div><b>Location:</b> {{ state.event.location || '—' }}</div>
      <div><b>Date:</b> {{ state.event.date }}</div>
      <div><b>Drivers:</b> {{ state.registrations.length }} ({{ checkedIn }} checked in)</div>
      <div><b>Runs:</b> {{ finishedCount }}</div>
      <div><b>Run Groups:</b> {{ state.event.runGroups.map(g => g.name).join(' ') || '—' }}</div>
      <div><b>Cone Stations:</b> {{ state.event.coneStations.join(' ') || '—' }}</div>
      <div><b>Counts for points:</b> {{ state.event.countsForPoints ? 'Yes' : 'No' }}</div>
      <div><b>Cone penalty:</b> {{ state.event.rules.conePenaltyMs / 1000 }} s · <b>Max runs:</b> {{ state.event.rules.maxRuns || 'no limit' }}</div>
    </div>
    <div class="ax-h2">Event Administration</div>
    <div class="ax-tiles">
      <router-link class="ax-tile" :to="`/event/${id}/registration`"><span class="mdi mdi-card-account-details-outline"></span>Registration &amp; Check-in</router-link>
      <router-link class="ax-tile" :to="`/event/${id}/setup`"><span class="mdi mdi-cog"></span>Event Setup</router-link>
      <router-link class="ax-tile" :to="`/event/${id}/runs`"><span class="mdi mdi-clock-outline"></span>Raw Times / Run Log</router-link>
      <router-link class="ax-tile" to="/hardware"><span class="mdi mdi-timer-cog-outline"></span>Timing Hardware</router-link>
    </div>
    <div class="ax-h2">Run the Event</div>
    <div class="ax-tiles">
      <router-link class="ax-tile blue" :to="`/event/${id}/timekeeper`"><span class="mdi mdi-timer-outline"></span>Time Keeper / Queue</router-link>
      <router-link class="ax-tile blue" :to="`/event/${id}/cones`"><span class="mdi mdi-cone"></span>Cone Counter</router-link>
      <router-link class="ax-tile blue" :to="`/event/${id}/results`"><span class="mdi mdi-flag-checkered"></span>Live Results</router-link>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { state, watchEvent } from '../api';
const id = Number(useRoute().params.id);
watchEvent(id);
const checkedIn = computed(() => state.value?.registrations.filter(r => r.checkedIn).length ?? 0);
const finishedCount = computed(() => state.value?.runs.filter(r => r.status === 'F').length ?? 0);
</script>
