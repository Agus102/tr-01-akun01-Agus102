// shoot.mjs — capture three screenshots of the token radar dashboard: the board, a protocol's
// detail view, and a filtered view. Serves <repo>/out locally (the page itself needs no network)
// and drives Chromium. The filtered view picks a category in the real control, as a reader does.
//
// The gate takes a screenshot whose long side is at most 1440 and short side at least 800, so every
// frame is captured in a 1440-square window at one device pixel each. A detail-rich frame lands in
// the 300-350 KiB band the dossier asks for; the tool prints each file's size so a run shows it.
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
// The gate takes a screenshot whose long side is at most 1440 and short side at least 800, and the
// dossier wants each frame at 300 to 350 KiB. A 1060x1000 CSS window rendered at 1.3585 device pixels
// each gives a 1440x1359 image: a full, readable board that lands in that byte band on this page.
const page = await browser.newPage({ viewport: { width: 1060, height: 1000 }, deviceScaleFactor: 1.3585 });

const URL_BASE = `http://127.0.0.1:${PORT}/dashboard/index.html`;

async function fresh(hash) {
  await page.goto(URL_BASE + (hash || ''), { waitUntil: 'load' });
  await page.waitForTimeout(400);
}

async function snap(file) {
  await page.screenshot({ path: join(repo, file), type: 'png' });
  const size = statSync(join(repo, file)).size;
  console.log(`${file} ${Math.round(size / 1024)} KiB`);
}

mkdirSync(join(repo, 'screenshots'), { recursive: true });

// 1. The board: the masthead, the worked example and the top of the ranked table.
await fresh();
await snap('screenshots/1-board.png');

// 2. A protocol's detail view: click the top row so the drawer opens.
await page.locator('tbody tr').first().click();
await page.waitForTimeout(600);
await snap('screenshots/2-detail.png');

// 3. A filtered view: pick a chain and a minimum implied value in the real controls, as a reader does.
await fresh();
await page.selectOption('#chain', 'Ethereum');
await page.selectOption('#min', '10000000');
await page.waitForTimeout(300);
await snap('screenshots/3-filtered.png');

await browser.close();
server.close();
console.log('done');
