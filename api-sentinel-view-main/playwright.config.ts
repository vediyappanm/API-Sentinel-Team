import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendRoot, '..');
const isWindows = process.platform === 'win32';
const pythonExecutable = isWindows ? '.\\venv311\\Scripts\\python.exe' : (process.env.PYTHON ?? 'python');
const backendEnv = {
  DEBUG: 'true',
  PYTHONPATH: repoRoot,
  DATABASE_URL: 'sqlite+aiosqlite:///./e2e_api_security.db',
  STARTUP_BOOTSTRAP_SCHEMA: 'true',
  STARTUP_ENABLE_DEMO_BOOTSTRAP: 'false',
  STARTUP_ENABLE_TEST_SCHEDULER: 'false',
  STARTUP_ENABLE_INGESTION_QUEUE: 'false',
  STARTUP_ENABLE_WARM_EXPORTER: 'false',
  STARTUP_ENABLE_ENDPOINT_LIFECYCLE: 'false',
  STARTUP_ENABLE_RECON_SCHEDULER: 'false',
  STARTUP_ENABLE_STREAM_PIPELINE: 'false',
  STARTUP_ENABLE_ANALYTICS_PROCESSOR: 'false',
  STARTUP_ENABLE_ARCHIVER: 'false',
};

function formatEnvForShell(env: Record<string, string>) {
  if (isWindows) {
    return Object.entries(env)
      .map(([key, value]) => `$env:${key}='${value.replace(/'/g, "''")}'`)
      .join('; ');
  }

  return Object.entries(env)
    .map(([key, value]) => `${key}='${value.replace(/'/g, "'\\''")}'`)
    .join(' ');
}

const backendCommand = isWindows
  ? `powershell -NoProfile -Command "${formatEnvForShell(backendEnv)}; ${pythonExecutable} -m uvicorn server.api.main:app --host 127.0.0.1 --port 8000"`
  : `${formatEnvForShell(backendEnv)} ${pythonExecutable} -m uvicorn server.api.main:app --host 127.0.0.1 --port 8000`;

const frontendCommand = isWindows
  ? 'cmd /c set VITE_API_BASE_URL=http://127.0.0.1:8000&& npm run dev -- --host 127.0.0.1 --port 5173'
  : "VITE_API_BASE_URL='http://127.0.0.1:8000' npm run dev -- --host 127.0.0.1 --port 5173";

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: backendCommand,
      cwd: repoRoot,
      url: 'http://127.0.0.1:8000/api/health/ready',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: frontendCommand,
      cwd: frontendRoot,
      url: 'http://127.0.0.1:5173',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
