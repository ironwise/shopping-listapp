import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  // 각 테스트가 Supabase 테이블을 비우고 시작하므로 병렬로 돌리면 서로를 지운다.
  // 테이블 하나를 모두가 공유하는 구조라 순차 실행이 맞다.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // `file://` 은 Playwright 가 막으므로 테스트 중에만 http 로 띄운다.
  webServer: {
    command: 'node serve.js',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
