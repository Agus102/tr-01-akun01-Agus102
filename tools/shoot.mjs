// shoot.mjs — capture three screenshots of the token radar dashboard: the board, a protocol's
// detail view, and a filtered view. Serves <repo>/out locally (the page itself needs no network)
// and drives Chromium. The filtered view picks filters in the real controls, as a reader does.
//
// The gate takes a screenshot whose long side is at most 1440 and short side at least 800, and the
// dossier wants each frame at 300 to 350 KiB. The page is rendered at 1060 CSS pixels wide and 1.3585
// device pixels each, so every image is 1440 wide; each shot then picks the window height and scroll
// that put the most of the board in one frame and land in that byte band. The tool prints each size.
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
const SCALE = 1.3585;   // 1060 CSS px -> 1440 image px, the gate's long-side cap
const WIDTH = 1060;

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
const page = await browser.newPage({ viewport: { width: WIDTH, height: 1060 }, deviceScaleFactor: SCALE });

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

// 1. The board: the masthead, the radar scope, the tests it passes and the top of the ranked table.
await page.setViewportSize({ width: WIDTH, height: 1060 });
await fresh();
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(150);
await snap('screenshots/1-board.png');

// 2. A protocol's detail view: click the top row so the drawer opens, then scroll the drawer so the
//    derivation and the farm plan's own steps and costs share one frame.
await page.setViewportSize({ width: WIDTH, height: 780 });
await page.locator('tbody tr').first().click();
await page.waitForTimeout(600);
await page.evaluate(() => {
  const plan = document.querySelector('.detail .steps');
  if (plan) document.querySelector('.detail').scrollTop = Math.max(0, plan.offsetTop - 150);
});
await page.waitForTimeout(250);
await snap('screenshots/2-detail.png');

// 3. A filtered view: pick a chain and a minimum implied value in the real controls, as a reader does,
//    then scroll so the active filters and the filtered, ranked rows are in one frame.
await page.setViewportSize({ width: WIDTH, height: 1060 });
await fresh();
await page.selectOption('#chain', 'Ethereum');
await page.selectOption('#min', '10000000');
await page.waitForTimeout(300);
await page.evaluate(() => window.scrollTo(0, 120));
await page.waitForTimeout(200);
await snap('screenshots/3-filtered.png');

await browser.close();
server.close();
console.log('done');
