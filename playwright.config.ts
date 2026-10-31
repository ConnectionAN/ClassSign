import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests/ui',fullyParallel:true,
 use:{baseURL:'http://127.0.0.1:4173',timezoneId:'Asia/Taipei',viewport:{width:1180,height:900}},
 webServer:{command:'npm run dev -- --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false,
  env:{VITE_SUPABASE_URL:'https://classsign-test.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}},
});
