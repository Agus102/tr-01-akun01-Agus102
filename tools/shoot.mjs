// shoot.mjs — capture three screenshots of the token radar dashboard: the board, a protocol's
// detail view, and a filtered view. Serves <repo>/out locally (the page itself needs no network)
// and drives Chromium. The filtered view picks a category in the real control, as a reader does.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const repo = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const OUT = join(repo, 'out');
// Playwright is a global install on this machine; load it by path so the tool runs from anywhere.
const require = createRequire('/usr/lib/node_modules/');
const { chromium } = require('playwright');

const EXEC = process.env.CHROMIUM || join(process.env.HOME || '/root', '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const PORT = 18471;

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/dashboard/index.html';
  const file = join(OUT, p);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });

const URL_BASE = `http://127.0.0.1:${PORT}/dashboard/index.html`;

async function fresh() {
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
}

async function snap(file) {
  await page.screenshot({ path: join(repo, file), type: 'png' });
  const size = statSync(join(repo, file)).size;
  console.log(`${file} ${Math.round(size / 1024)} KiB`);
}

mkdirSync(join(repo, 'screenshots'), { recursive: true });

// 1. The board, at the top, on the watchlist floor view.
await fresh();
await snap('screenshots/1-board.png');

// 2. A protocol's detail view: click the top row so the drawer opens.
await page.locator('tbody tr').first().click();
await page.waitForTimeout(600);
await snap('screenshots/2-detail.png');

// 3. A filtered view: pick a category and a chain in the real controls, as a reader does.
await fresh();
await page.selectOption('#category', 'Lending');
await page.waitForTimeout(300);
await snap('screenshots/3-filtered.png');

await browser.close();
server.close();
console.log('done');
