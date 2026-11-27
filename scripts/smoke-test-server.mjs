import { spawn } from 'child_process';
import http from 'http';

const TEST_PORT = process.env.TEST_PORT || '3099';

console.log(`[smoke-test] Starting server on port ${TEST_PORT}...`);

const serverProcess = spawn('node', ['api/server.js'], {
  env: {
    ...process.env,
    PORT: TEST_PORT,
    NODE_ENV: 'production',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
let isResolved = false;

const cleanup = () => {
  if (serverProcess && !serverProcess.killed) {
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F']);
      } catch {
        serverProcess.kill('SIGKILL');
      }
    } else {
      serverProcess.kill('SIGTERM');
    }
  }
};

const timeout = setTimeout(() => {
  if (!isResolved) {
    isResolved = true;
    console.error('[smoke-test] ❌ FAILED: Server did not start within 15 seconds.');
    console.error('[smoke-test] Server output was:\n', serverOutput);
    cleanup();
    process.exit(1);
  }
}, 15000);

const checkEndpoint = async () => {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${TEST_PORT}/api/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          try {
            const json = JSON.parse(data);
            if (json.status === 'ok') {
              resolve({ status: res.statusCode, body: json });
            } else {
              reject(new Error(`Unexpected payload: ${data}`));
            }
          } catch (e) {
            resolve({ status: res.statusCode, dataLength: data.length });
          }
        } else {
          reject(new Error(`HTTP status ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(4000, () => {
      req.destroy(new Error('Request timeout'));
    });
  });
};

serverProcess.stdout.on('data', async (chunk) => {
  const text = chunk.toString();
  serverOutput += text;
  process.stdout.write(`[server stdout] ${text}`);

  if (text.includes('FITeT Backend Server running') && !isResolved) {
    console.log('[smoke-test] Detected listener announcement! Verifying HTTP endpoint...');
    try {
      // Small pause to let routes initialize
      await new Promise((r) => setTimeout(r, 400));
      const res = await checkEndpoint();
      isResolved = true;
      clearTimeout(timeout);
      console.log(`[smoke-test] ✅ SUCCESS! Server responded on port ${TEST_PORT} with HTTP ${res.status} (${res.dataLength} bytes).`);
      cleanup();
      process.exit(0);
    } catch (err) {
      isResolved = true;
      clearTimeout(timeout);
      console.error('[smoke-test] ❌ FAILED: Endpoint check failed:', err.message);
      cleanup();
      process.exit(1);
    }
  }
});

serverProcess.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  serverOutput += text;
  process.stderr.write(`[server stderr] ${text}`);
});

serverProcess.on('exit', (code) => {
  if (!isResolved) {
    isResolved = true;
    clearTimeout(timeout);
    console.error(`[smoke-test] ❌ FAILED: Server process exited unexpectedly with code ${code}.`);
    console.error('[smoke-test] Server output:\n', serverOutput);
    process.exit(1);
  }
});
