// Local gate verifier for token-radar-01: reproduces the seven scorer rows from RULES.txt against
// an entry's /output. Usage: node tools/gate.mjs <output-dir>
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || 'out';
const SNAP = process.env.SNAPSHOT || join(import.meta.dirname, '..', 'token-radar-01-kit', 'input', 'snapshot.json');
const snap = JSON.parse(readFileSync(SNAP, 'utf8'));
const slugs = new Set(snap.protocols.map((p) => p.slug));
const watch = snap.watchlist;
const rows = [];
const ok = (k, pass, detail = '') => rows.push([k, pass, detail]);

const NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const NET = /https?:\/\//;

// 1. dashboard_files
let dfPass = true, dfDetail = '';
{
  const dir = join(OUT, 'dashboard');
  if (!existsSync(dir)) { dfPass = false; dfDetail = 'no dashboard/'; }
  else {
    const files = readdirSync(dir).filter((n) => !n.startsWith('.'));
    const all = [];
    const walk = (d) => { for (const n of readdirSync(d)) { if (n.startsWith('.')) continue; const p = join(d, n); if (statSync(p).isDirectory()) { if (n.startsWith('.')) { dfPass = false; dfDetail = `dot dir ${n}`; } walk(p); } else all.push(p); } };
    walk(dir);
    if (all.length > 400) { dfPass = false; dfDetail = `${all.length} files > 400`; }
    let bytes = 0; for (const f of all) bytes += statSync(f).size;
    if (bytes > 4_194_304) { dfPass = false; dfDetail = `${bytes} bytes > 4MiB`; }
    const hasHtml = all.some((f) => f.endsWith('index.html'));
    const hasCss = all.some((f) => f.endsWith('.css'));
    const hasJs = all.some((f) => f.endsWith('.js'));
    if (!hasHtml || !hasCss || !hasJs) { dfPass = false; dfDetail = `needs index.html+css+js`; }
    for (const f of all) {
      const base = f.slice(f.lastIndexOf('/') + 1);
      if (!NAME_OK.test(base)) { dfPass = false; dfDetail = `bad name ${base}`; }
      const txt = readFileSync(f, 'utf8');
      if (f.endsWith('.html')) {
        const attrs = txt.match(/[a-zA-Z-]+\s*=\s*["'][^"']*["']/g) || [];
        for (const a of attrs) if (NET.test(a)) { dfPass = false; dfDetail = `http in attr ${base}: ${a.slice(0,40)}`; }
        const style = txt.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
        for (const s of style) if (NET.test(s)) { dfPass = false; dfDetail = `http in style ${base}`; }
        const imports = txt.match(/import\s+[^;]*from\s*["'][^"']+["']/g) || [];
        for (const im of imports) if (NET.test(im)) { dfPass = false; dfDetail = `http in import ${base}`; }
      }
      if (f.endsWith('.css') && NET.test(txt)) { dfPass = false; dfDetail = `http in css ${base}`; }
      if (f.endsWith('.js') || f.endsWith('.mjs')) {
        if (NET.test(txt.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) { /* visible text/comment allowed; only import specifiers/url() matter */ }
        const imp = txt.match(/(?:import|export)\s*[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']/g) || [];
        for (const im of imp) if (NET.test(im)) { dfPass = false; dfDetail = `http in js import ${base}`; }
      }
    }
  }
}
ok('dashboard_files', dfPass, dfDetail);

// 2. board_file + 3. sorted_by_value + 4. coverage + 5. farm_steps
let b = null;
try { b = JSON.parse(readFileSync(join(OUT, 'board.json'), 'utf8')); } catch { b = null; }
const boardRows = b && Array.isArray(b.rows) ? b.rows : Array.isArray(b) ? b : null;
ok('board_file', boardRows !== null && boardRows.length >= 100 && boardRows.length <= 4000 && statSync(join(OUT, 'board.json')).size <= 8 * 1024 * 1024, boardRows ? `${boardRows.length} rows` : 'no rows');
if (boardRows) {
  let good = true, detail = '';
  for (const r of boardRows) {
    if (!slugs.has(r.slug)) { good = false; detail = `invented slug ${r.slug}`; break; }
    if (typeof r.name !== 'string' || r.name.length === 0) { good = false; detail = `${r.slug} no name`; break; }
    if (!Number.isInteger(r.rank) || r.rank <= 0) { good = false; detail = `${r.slug} bad rank`; break; }
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) { good = false; detail = `${r.slug} bad implied`; break; }
    if (!Array.isArray(r.farm_steps)) { good = false; detail = `${r.slug} no steps`; break; }
  }
  ok('board_fields', good, detail);
  // ranks 1..N, non-rising implied
  const ranks = boardRows.map((r) => r.rank).sort((a, c) => a - c);
  let sorted = true, sdet = '';
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) { sorted = false; sdet = `rank ${i+1} is ${ranks[i]}`; break; }
  if (sorted) for (let i = 1; i < boardRows.length; i++) if (boardRows[i].implied_value_usd > boardRows[i-1].implied_value_usd) { sorted = false; sdet = `row ${i+1} > row ${i}`; break; }
  const allSame = boardRows.length >= 2 && boardRows.every((r) => r.implied_value_usd === boardRows[0].implied_value_usd);
  ok('sorted_by_value', sorted && !allSame, sdet || (allSame ? 'all same' : ''));
  // coverage
  const set = new Set(boardRows.map((r) => r.slug));
  const missing = watch.filter((s) => !set.has(s));
  ok('coverage', missing.length === 0, missing.slice(0, 4).join(','));
  // farm_steps
  let fs = true, fdet = '';
  for (const r of boardRows) {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) { fs = false; fdet = `${r.slug} ${r.farm_steps && r.farm_steps.length} steps`; break; }
    for (const s of r.farm_steps) { const t = String(s).trim(); if (t.length < 20 || t.length > 600) { fs = false; fdet = `${r.slug} step ${t.length} chars`; break; } }
    if (!fs) break;
  }
  ok('farm_steps', fs, fdet);
}

// 6. screenshots
{
  const dir = join(OUT, 'screenshots');
  let pass = false, detail = '';
  if (!existsSync(dir)) detail = 'no screenshots/';
  else {
    const imgs = readdirSync(dir).filter((n) => !n.startsWith('.'));
    if (imgs.length < 3 || imgs.length > 4) detail = `${imgs.length} images`;
    else {
      pass = true;
      for (const n of imgs) {
        const p = join(dir, n);
        const sz = statSync(p).size;
        if (sz > 524_288) { pass = false; detail = `${n} ${sz}B > 512KiB`; break; }
        const head = readFileSync(p).subarray(0, 32);
        const isPng = head[0] === 0x89 && head[1] === 0x50;
        const isJpg = head[0] === 0xff && head[1] === 0xd8;
        if (!isPng && !isJpg) { pass = false; detail = `${n} not whole png/jpg`; break; }
      }
    }
  }
  ok('screenshots', pass, detail);
}

// 7. dossier_matches + size
{
  const p = join(OUT, 'dossier.json');
  const sz = existsSync(p) ? statSync(p).size : 0;
  ok('dossier_matches', existsSync(p) && sz <= 1_572_864, `${sz} bytes (rebuild compare done separately)`);
}

console.log(`GATE for ${OUT}`);
let all = true;
for (const [k, pass, detail] of rows) { if (!pass) all = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${k.padEnd(18)} ${detail}`); }
console.log(all ? 'ALL GATE ROWS PASS (except dossier byte-rebuild)' : 'GATE FAILURES ABOVE');
