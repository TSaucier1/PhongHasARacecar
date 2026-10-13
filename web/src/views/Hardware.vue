<template>
  <TopBar title="Timing Hardware" back="/" back-label="Home" />
  <div class="ax-page" style="max-width:640px" v-if="hw">
    <v-alert :type="hw.connected ? 'success' : hw.enabled ? 'warning' : 'info'" variant="tonal" style="margin-bottom:14px">
      <template v-if="hw.connected">Connected to {{ hw.port }}. Times go to <b>{{ eventName(hw.liveEventId) }}</b>.</template>
      <template v-else-if="hw.enabled">Not connected{{ hw.lastError ? ': ' + hw.lastError : '' }}</template>
      <template v-else>Hardware is off. Times can be entered on the Time Keeper screen.</template>
    </v-alert>
    <v-select v-model="form.type" :items="hw.types" item-title="label" item-value="id" label="Timer type" />
    <v-select v-model="form.port" :items="hw.ports" item-title="label" item-value="path" label="Serial port" :hint="hw.ports.length ? '' : 'No serial ports found. Plug in the USB-serial adapter and reload.'" persistent-hint />
    <v-select v-model="form.liveEventId" :items="events" item-title="name" item-value="id" label="Send times to event" />
    <v-switch v-model="form.enabled" label="Hardware enabled" color="primary" />
    <div class="ax-btn" @click="save">Save &amp; connect</div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import TopBar from '../components/TopBar.vue';
import { api } from '../api';
const hw = ref<any>(null); const form = ref<any>({}); const events = ref<any[]>([]);
const eventName = (id: number) => events.value.find(e => e.id === id)?.name || 'no event selected';
async function load() {
  hw.value = await api('GET', '/hardware');
  form.value = { type: hw.value.type, port: hw.value.port, enabled: hw.value.enabled, liveEventId: hw.value.liveEventId || events.value[0]?.id };
}
onMounted(async () => { events.value = await api('GET', '/events'); await load(); });
async function save() { await api('POST', '/hardware', form.value); await load(); }
</script>
