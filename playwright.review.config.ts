import {defineConfig} from '@playwright/test';
import base from './playwright.config';
// Run against an already running local preview; does not start or stop a server.
export default defineConfig({...base,webServer:undefined,reporter:[['list'],['json',{outputFile:'artifacts/visual-v142/test-results.json'}]]});
