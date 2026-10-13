<template>
  <TopBar title="Registration" :back="`/event/${id}`" back-label="Event" strip live />
  <div class="ax-page" v-if="state">
    <div class="ax-row2" style="margin-bottom:10px">
      <div class="ax-btn" @click="edit = {}"><span class="mdi mdi-account-plus"></span>Register a Driver</div>
      <div class="ax-btn grey" @click="onlyOut = !onlyOut" :class="{ on: onlyOut }">{{ onlyOut ? 'Showing not checked in' : 'Show only not checked in' }}</div>
    </div>
    <input class="ax-search" v-model="q" placeholder="Filter by car #, name, class or car…" />
    <div class="ax-muted" style="margin:8px 2px">{{ shown.length }} of {{ state.registrations.length }} drivers · {{ checked }} checked in</div>
    <div class="ax-list">
      <div v-for="r in shown" :key="r.id" class="ax-li" @click="edit = r">
        <span class="ax-dot" :style="{ background: groupColor(r.runGroup) }" :title="r.runGroup"></span>
        <div class="grow">
          <div class="name">{{ fullName(r) }} <span v-if="r.isRookie" class="ax-flag grey">ROOKIE</span></div>
          <div class="sub">{{ r.className }} · {{ r.car }} {{ r.carColor ? '(' + r.carColor + ')' : '' }}</div>
        </div>
        <div class="ax-carnum sm">{{ r.carNumber }}</div>
        <v-btn :icon="r.checkedIn ? 'mdi-check-circle' : 'mdi-checkbox-blank-circle-outline'" :color="r.checkedIn ? 'success' : 'grey'" variant="text"
          @click.stop="api('POST', `/events/${id}/registrations/${r.id}/flags`, { checkedIn: !r.checkedIn })" :title="r.checkedIn ? 'Checked in' : 'Check in'" />
      </div>
    </div>
  </div>
  <RegDialog v-model="edit" :event-id="id" />
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import RegDialog from '../components/RegDialog.vue';
import { api, state, watchEvent, fullName, groupColor } from '../api';
const id = Number(useRoute().params.id);
watchEvent(id);
const q = ref(''); const onlyOut = ref(false); const edit = ref<any>(null);
const checked = computed(() => state.value?.registrations.filter(r => r.checkedIn).length ?? 0);
const shown = computed(() => (state.value?.registrations || []).filter(r =>
  (!onlyOut.value || !r.checkedIn) && (!q.value || `${r.carNumber} ${fullName(r)} ${r.className} ${r.car}`.toLowerCase().includes(q.value.toLowerCase()))));
</script>
