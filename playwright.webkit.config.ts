import {defineConfig} from '@playwright/test';
import base from './playwright.review.config';
export default defineConfig({...base,use:{...base.use,browserName:'webkit'},reporter:[['list']]});
