import { createRouter, createWebHistory } from 'vue-router';
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/Home.vue') },
    { path: '/hardware', component: () => import('./views/Hardware.vue') },
    { path: '/event/:id', component: () => import('./views/EventHome.vue') },
    { path: '/event/:id/registration', component: () => import('./views/Registration.vue') },
    { path: '/event/:id/timekeeper', component: () => import('./views/Timekeeper.vue') },
    { path: '/event/:id/cones', component: () => import('./views/ConeCounter.vue') },
    { path: '/event/:id/results', component: () => import('./views/LiveResults.vue') },
    { path: '/event/:id/runs', component: () => import('./views/RunLog.vue') },
    { path: '/event/:id/setup', component: () => import('./views/EventSetup.vue') },
  ],
});
