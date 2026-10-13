<template>
  <div>
    <div class="ax-bar">
      <router-link v-if="back" :to="back" class="ax-barbtn"><span class="mdi mdi-chevron-left"></span>{{ backLabel || 'Back' }}</router-link>
      <router-link v-else to="/" class="ax-barbtn"><span class="mdi mdi-home"></span>Club Home</router-link>
      <h1>{{ title }}</h1>
      <v-menu>
        <template #activator="{ props }"><span class="ax-barbtn" v-bind="props"><span class="mdi mdi-account"></span>{{ role }}</span></template>
        <v-list density="compact"><v-list-subheader>I'm working as…</v-list-subheader>
          <v-list-item v-for="r in ROLES" :key="r" :title="r" @click="role = r" :active="r === role" /></v-list>
      </v-menu>
    </div>
    <div v-if="live && !connected" class="ax-offline">Reconnecting to the timing computer…</div>
    <div v-if="strip && state" class="ax-strip">
      <span>{{ state.event.name }} &nbsp;{{ usDate(state.event.date) }}</span><span class="spacer"></span>
      <span v-if="state.event.currentRunGroup"><span class="ax-dot" :style="{ background: groupColor(state.event.currentRunGroup) }"></span> {{ state.event.currentRunGroup }} running</span>
    </div>
    <v-snackbar v-model="showErr" color="error" timeout="4000">{{ lastError }}</v-snackbar>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { role, ROLES, state, connected, lastError, groupColor } from '../api';
defineProps<{ title: string; back?: string; backLabel?: string; strip?: boolean; live?: boolean }>();
const showErr = computed({ get: () => !!lastError.value, set: v => { if (!v) lastError.value = ''; } });
const usDate = (d: string) => { const [y, m, dd] = d.split('-'); return `${m}/${dd}/${y}`; };
</script>
