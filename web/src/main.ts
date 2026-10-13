import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import './styles.css';
import App from './App.vue';
import { router } from './router';

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'ax',
    themes: { ax: { dark: false, colors: { primary: '#3a7cb8', secondary: '#555555', error: '#c62828', success: '#2e7d32', background: '#f2f2f2' } } },
  },
  defaults: { VBtn: { variant: 'flat' }, VTextField: { variant: 'outlined', density: 'comfortable' }, VSelect: { variant: 'outlined', density: 'comfortable' } },
});
createApp(App).use(vuetify).use(router).mount('#app');
