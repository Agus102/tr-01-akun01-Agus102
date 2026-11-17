// shoot.mjs — capture three screenshots of the token radar dashboard: the board, a protocol's
// detail view, and a filtered view. Serves <repo>/out locally (the page itself needs no network)
// and drives Chromium. The filtered view picks a category in the real control, as a reader does.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const repo = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const OUT = join(repo, 'out');
const require = createRequire('/home/xinox/circle-faucet-bot/');
const { chromium } = require('playwright');

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

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });

const URL_BASE = `http://127.0.0.1:${PORT}/dashboard/index.html`;

async function fresh() {
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
}

async function snap(file) {
  await page.screenshot({ path: join(repo, file), type: 'png' });
  const size = statSync(join(repo, file)).size;
  console.log(`${file} ${Math.round(size / 1024)} KiB`);
}

mkdirSync(join(repo, 'screenshots'), { recursive: true });

// 1. The board, at the top.
await fresh();
await snap('screenshots/1-board.png');

// 2. A protocol's detail view: click the top row so the drawer opens.
await page.evaluate(() => {
  const row = document.querySelector('tbody tr');
  if (row) row.click();
});
await page.waitForTimeout(700);
await snap('screenshots/2-detail.png');

// 3. A filtered view: pick a category in the real control and type a search, as a reader would.
await fresh();
await page.selectOption('#category', 'Lending');
await page.waitForTimeout(300);
await page.fill('#q', 'credit');
await page.waitForTimeout(500);
await snap('screenshots/3-filtered.png');

await browser.close();
server.close();
console.log('done');
