// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders a
// ranked board of pre-token protocols, a filterable, sortable table, a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan, and the evidence behind the value model. No
// network: every byte it shows is in data.js, and every number is recomputed in the page from the
// snapshot figures so the page's code and board.json's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    view: 'watch',        // watch | early | all | live
    sort: 'implied',
    dir: -1,
    min: 0,
    selected: null,
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd.format(n);
  }
  function fmtPct(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 1 : digits) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 365) return '1.0y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // ---- The model, in the page ----------------------------------------------------------------
  // The same function main.ts runs: the multiple board.json stores for this row (the size fit for the
  // protocol's TVL, corrected by its category's residual) times a growth multiplier from change_7d and
  // a maturity multiplier from its age with no token. The page recomputes the row and checks it against
  // the number board.json carries, so the two are visibly the same arithmetic.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor,
      row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = round4(1 + (growth / 100) * m.growth_weight);
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = round4(m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range);
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- Farm plan, the same derivation main.ts writes to board.json ----------------------------
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function ageWord(age) {
    if (age === null || age === undefined) return 'an unrecorded age';
    if (age < 60) return age + ' days';
    var months = Math.round(age / 30.44);
    var article = months >= 8 && months <= 11 ? 'an' : 'a';
    if (months < 24) return article + ' ' + months + '-month';
    return (age / 365).toFixed(1) + '-year';
  }
  function growthWord(change) {
    if (change === null || change === undefined) return 'no seven-day figure is recorded';
    return (change >= 0 ? 'up ' : 'down ') + Math.abs(change).toFixed(1) + '% over the last seven days';
  }
  function whyNow(p, age) {
    return p.name + ' records $' + (p.tvl_usd / 1e6).toFixed(1) + 'M of TVL, ' + growthWord(p.change_7d) + ' and ' + ageWord(age) + ' record with no token on file';
  }
  function roundTripGas(p) {
    var chains = Math.max(1, Math.min(p.chains ? p.chains.length : 1, 5));
    var base = p.tvl_usd >= 1e9 ? 6 : p.tvl_usd >= 1e8 ? 4 : 3;
    return base + chains;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('credit') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as a lender (two deposits a few days apart if it takes a minimum), then borrow a small amount against it so the wallet is both a supplier and a borrower.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Add $" + capital + " of liquidity to " + name + "'s deepest pool on " + chain + ", in the pool's two tokens, and keep the LP position open through the whole window; add a second, smaller position if the app has more than one venue.";
    if (c.indexOf('perpetual') >= 0 || c.indexOf('perps') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ', then open and close one small perpetual or basis position end to end so a settled trade shows.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC to ' + chain + " through " + name + "'s bridge and then use the funds inside its own app (swap, lend or LP there), not only in transit, so the bridge and its venue both show activity.";
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('liquid staking') >= 0) return "Stake $" + capital + " of " + chain + "'s native asset through " + name + ' on ' + chain + ' and keep the receipt token in the same wallet; delegate to more than one validator if the app offers it.';
    if (c.indexOf('prediction') >= 0) return 'Fund the account with $' + capital + ', place one small market on ' + name + ' on ' + chain + ', and leave the position open until it resolves.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('asset management') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' run by a curator with a public track record, and keep the vault shares in the same wallet.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('treasury') >= 0) return "Mint or buy $" + capital + " of " + name + "'s yield-bearing asset on " + chain + " after checking the issuer's redemption terms, and hold it in the wallet.";
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ', and hold it through the window without looping it for yield.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' on a pool you understand, and keep the policy active through the window.';
    if (c.indexOf('options') >= 0) return 'Write one small covered option against $' + capital + ' of collateral on ' + name + ' on ' + chain + ' and let it settle.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open for the whole window.';
  }
  function secondaryFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'repay part of the borrow and take it out again, so a repayment and a withdrawal both show.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'move the position between two pools once, or place a limit order, so trading volume shows as well as liquidity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('perps') >= 0 || c.indexOf('derivative') >= 0) return 'close the position and open a smaller one, so a settled trade and a fresh one both show.';
    if (c.indexOf('bridge') >= 0) return 'bridge a small second amount back out through ' + p.name + ', so both directions of the bridge show.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'claim the staking reward once and re-stake it, so the claim and the restake both show.';
    if (c.indexOf('prediction') >= 0) return 'place a second, opposite position on another market so two resolved positions show.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('treasury') >= 0) return 'redeem a small part once and re-subscribe, so the mint and the redemption both show.';
    return 'make one swap or one small deposit in a second pool on ' + chain + ' so two contracts show activity.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var gas = roundTripGas(p);
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.max(1, Math.ceil(hold / 7));
    return [
      { text: 'Read the case before spending: ' + whyNow(p, p.age_days) + ". Open " + p.name + "'s own site and its docs or points page and confirm there what it counts as activity; if no such page exists, farm it as an ordinary depositor and treat any token as uncertainty, not a promise.", cost: 'free to check, and never pay a fee to qualify', time: '20 minutes of reading' },
      { text: 'Use a fresh wallet that holds only the funds you plan to farm on ' + chain + ', keep its seed phrase offline, and never reuse a wallet that already holds a valuable position, so a contract risk stays contained.', cost: 'about $3 of gas to fund the wallet', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of round-trip gas', time: '20 minutes to set up' },
      { text: 'Add a second kind of qualifying activity: ' + secondaryFor(p, chain), cost: 'about $' + Math.max(2, Math.round(gas / 2)) + ' of gas', time: '15 minutes' },
      { text: 'Stay active for at least ' + hold + ' days (' + weeks + ' weekly check' + (weeks === 1 ? '' : 's') + "), so the activity is counted in more than one snapshot of the protocol's TVL; a one-off deposit on the last day is the plan most often filtered out.", cost: 'the $' + capital + ' stays in the position, and about $2 of gas a week', time: hold + ' days, 10 minutes a week' },
      { text: "Before you withdraw, open the protocol's own rewards page and claim only from the link that page publishes; then write the wallet, the dates, every transaction and what it cost in a farm log, so the position's cost basis is known if a token ever comes.", cost: 'no fee to check or to claim, and nothing to keep the log', time: '15 minutes to claim and log' }
    ].map(stepText);
  }

  // ---- Filter, sort, hash --------------------------------------------------------------------
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('view')) state.view = params.get('view');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = Number(params.get('dir')) || -1;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.view !== 'watch') params.set('view', state.view);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  var WATCH = {};
  DATA.rows.forEach(function (r) { if (r.on_watchlist) WATCH[r.slug] = true; });

  function viewRows() {
    if (state.view === 'live') return [];
    if (state.view === 'watch') return DATA.rows.filter(function (r) { return r.on_watchlist; });
    if (state.view === 'early') return DATA.rows.filter(function (r) { return !r.on_watchlist; });
    return DATA.rows;
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var min = state.min || 0;
    return viewRows().filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (min > 0 && r.implied_value_usd < min) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -Infinity : a.age_days; bv = b.age_days === null ? -Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else if (key === 'net') { av = a.net_usd_per_hour; bv = b.net_usd_per_hour; }
      else if (key === 'category') { av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function categories() {
    return Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
  }
  function chains() {
    var set = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { set[c] = true; }); });
    return Object.keys(set).sort();
  }

  // ---- Render ---------------------------------------------------------------------------------
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index, ' + DATA.model_version }),
        el('span', { text: DATA.rows.length + ' rounds ranked' })
      )
    );
  }

  // A radar scope drawn once, in the page's own palette: range rings, a sweep, and one blip per
  // pre-token protocol the board ranks, at its TVL on a log radius. It is the page's identity and a
  // second reading of the board (blips cluster at the bottom-left, the small protocols).
  function heroScope() {
    var NS = 'http://www.w3.org/2000/svg';
    var W = 1288, H = 164, cx = 110, cy = H / 2, R = H / 2 - 10;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'A radar scope: every ranked pre-token protocol as a blip, placed by its TVL');
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<radialGradient id="sweep" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#2f9c72" stop-opacity="0.85"/><stop offset="55%" stop-color="#1d6b4d" stop-opacity="0.28"/><stop offset="100%" stop-color="#124a34" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="linegr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#2f9c72"/><stop offset="100%" stop-color="#b9781c"/></linearGradient>';
    svg.appendChild(defs);
    var add = function (tag, attrs, ns) {
      var n = document.createElementNS(ns || NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      svg.appendChild(n);
      return n;
    };
    add('rect', { x: 0, y: 0, width: W, height: H, fill: '#124a34' });
    add('circle', { cx: cx, cy: cy, r: R, fill: 'url(#sweep)' });
    for (var ring = 1; ring <= 6; ring++) {
      add('circle', { cx: cx, cy: cy, r: (R * ring) / 6, fill: 'none', stroke: '#3f8a6c', 'stroke-width': 1, opacity: 0.45 });
    }
    // A sweep wedge and the radial ticks a scope carries.
    add('path', { d: 'M ' + cx + ' ' + cy + ' L ' + (cx + R) + ' ' + cy + ' A ' + R + ' ' + R + ' 0 0 0 ' + (cx + R * Math.cos(-0.5)) + ' ' + (cy + R * Math.sin(-0.5)) + ' Z', fill: '#2f9c72', opacity: 0.22 });
    for (var t = 0; t < 48; t++) {
      var a = (t / 48) * Math.PI * 2;
      var long = t % 6 === 0;
      add('line', { x1: cx + (R - (long ? 13 : 7)) * Math.cos(a), y1: cy + (R - (long ? 13 : 7)) * Math.sin(a), x2: cx + R * Math.cos(a), y2: cy + R * Math.sin(a), stroke: '#3f8a6c', 'stroke-width': 1, opacity: 0.55 });
    }
    // Blips: TVL on a log radius (the smallest at the edge, the largest near the centre), rank on the
    // angle, so the whole ranked board is one sweep. Watchlist rows are amber, early finds green.
    var maxT = 0, minT = Infinity;
    DATA.rows.forEach(function (r) { if (r.tvl_usd > maxT) maxT = r.tvl_usd; if (r.tvl_usd < minT) minT = r.tvl_usd; });
    var lt = function (v) { return Math.log10(Math.max(1, v)); };
    var span = Math.max(0.001, lt(maxT) - lt(minT));
    DATA.rows.forEach(function (r, i) {
      var frac = 1 - (lt(r.tvl_usd) - lt(minT)) / span;      // 0 at the largest TVL
      var rr = 14 + frac * (R - 24);
      var ang = (i / DATA.rows.length) * Math.PI * 2 * 3.2 - 0.5;
      var bx = cx + rr * Math.cos(ang), by = cy + rr * Math.sin(ang);
      add('circle', { cx: bx.toFixed(1), cy: by.toFixed(1), r: r.on_watchlist ? 3.1 : 2.2, fill: r.on_watchlist ? '#e0a45a' : '#8fd3b4' });
    });
    // The masthead copy, drawn over the scope.
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'hero-copy');
    var t1 = add('text', { x: cx + R + 30, y: cy - 18, fill: '#eaf4ee', 'font-size': 22, 'font-weight': 600, 'font-family': 'Georgia, serif' });
    t1.textContent = 'Every pre-token protocol, on one sweep';
    var t2 = add('text', { x: cx + R + 30, y: cy + 8, fill: '#a9c9ba', 'font-size': 13.5, 'font-family': 'system-ui, sans-serif' });
    t2.textContent = DATA.rows.length + ' protocols ranked by implied value \u00b7 ' + DATA.watchlist.listed + ' on the watchlist floor \u00b7 ' + DATA.early_size + ' early finds the list left out';
    var t3 = add('text', { x: cx + R + 30, y: cy + 32, fill: '#7fb39c', 'font-size': 11.5, 'font-family': 'ui-monospace, monospace' });
    t3.textContent = '\u25cf watchlist floor   \u25cf early find   radius = log TVL, angle = rank';
    add('line', { x1: cx + R + 30, y1: cy + 44, x2: W - 30, y2: cy + 44, stroke: 'url(#linegr)', 'stroke-width': 2, opacity: 0.7 });
    return el('div', { class: 'hero' }, svg);
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', { class: 'lede-copy' },
        el('h1', { text: 'Pre-token protocols, ranked by what a launch would be worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record, minus the wrapped, staked and bridged products of tokens that already trade. The radar adds the ' + DATA.early_size + ' pre-token protocols the list leaves out \u2014 below the floor and the ones it dropped \u2014 so the board finds the early ones too. Implied value is a model, not a promise: a protocol may never issue a token, and this snapshot records none yet.' })
      ),
      el('div', { class: 'facts' },
        fact('Watchlist covered', DATA.watchlist.covered ? DATA.watchlist.listed + ' / ' + DATA.watchlist.listed : DATA.watchlist.listed + ' listed'),
        fact('Protocols scanned', String(DATA.rows.length)),
        fact('Early rows the list left out', String(DATA.early_size)),
        fact('Live tokens set aside', String(DATA.live_size))
      )
    );
  }
  function fact(k, v) {
    return el('div', { class: 'fact' }, el('span', { text: k }), el('b', { class: 'num', text: v }));
  }

  // A worked example of the model, on the board's own top row: TVL -> multiple -> growth -> maturity ->
  // implied value. It is the same arithmetic every row uses, shown once so the ranking is readable at
  // a glance and visibly a function of the snapshot's figures, not a list of names.
  function workedRow() {
    if (!DATA.rows.length) return null;
    var r = DATA.rows[0];
    var step = function (k, v, sub) {
      return el('div', { class: 'ws' },
        el('span', { class: 'ws-k', text: k }),
        el('b', { class: 'num ws-v', text: v }),
        el('span', { class: 'ws-sub', text: sub })
      );
    };
    return el('section', { class: 'worked' },
      el('div', { class: 'worked-head' },
        el('h2', { text: 'How a row is priced' }),
        el('p', { class: 'sub' }, 'One worked example: the board\u2019s top row, ' + r.name + '. Every row is the same product of the snapshot\u2019s own figures \u2014 its TVL, its seven-day growth and its age with no token \u2014 never a hand-written list.')
      ),
      el('div', { class: 'chain' },
        step('TVL', fmtUsd(r.tvl_usd), 'from the snapshot'),
        el('span', { class: 'op', text: '\u00d7' }),
        step('Multiple', r.multiple.toFixed(3) + '\u00d7', r.basis === 'category' ? 'read off ' + r.category_samples + ' live ' + (r.category || 'category') + ' tokens' : 'read off every live token'),
        el('span', { class: 'op', text: '\u00d7' }),
        step('7-day growth', r.growth_multiplier.toFixed(3) + '\u00d7', fmtPct(r.change_7d) + ' over the week'),
        el('span', { class: 'op', text: '\u00d7' }),
        step('Maturity', r.maturity_multiplier.toFixed(3) + '\u00d7', fmtAge(r.age_days) + ' with no token'),
        el('span', { class: 'op eq', text: '=' }),
        el('div', { class: 'ws ws-result' },
          el('span', { class: 'ws-k', text: 'Implied value' }),
          el('b', { class: 'num ws-v', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'ws-sub', text: 'base ' + fmtUsd(r.base_value_usd) + ' \u2192 after growth and maturity' })
        )
      ),
      scatterChart()
    );
  }

  function viewTabs() {
    var tabs = [
      ['watch', 'Watchlist floor', DATA.watchlist.listed],
      ['early', 'Early radar', DATA.early_size],
      ['all', 'All pre-token', DATA.rows.length],
      ['live', 'Live tokens', DATA.live.length]
    ];
    return el('div', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
      return el('button', {
        type: 'button',
        role: 'tab',
        'aria-pressed': state.view === t[0] ? 'true' : 'false',
        onclick: function () { state.view = t[0]; writeHash(); render(); }
      }, el('span', { text: t[1] }), el('b', { class: 'num', text: String(t[2]) }));
    }));
  }

  function controls() {
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories().map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains().map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var min = el('select', { id: 'min', 'aria-label': 'Minimum implied value' },
      [[0, 'Any implied value'], [1e6, 'At least $1M'], [1e7, 'At least $10M'], [5e7, 'At least $50M'], [1e8, 'At least $100M']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: String(state.min) === String(o[0]) ? 'selected' : null });
      })
    );
    min.addEventListener('change', function () { state.min = Number(min.value); render(); });
    var shown = state.view === 'live' ? DATA.live.length : filteredRows().length;
    var clear = el('button', { class: 'button ghost', type: 'button', text: 'Clear filters', onclick: function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.min = 0; state.view = 'watch'; writeHash(); render();
    } });
    return el('div', { class: 'controls' },
      el('div', { class: 'controls-top' },
        viewTabs(),
        el('span', { class: 'count', html: '<b>' + shown + '</b> ' + (state.view === 'live' ? 'live-token protocols' : 'rows shown') })
      ),
      el('div', { class: 'fields' },
        el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
        el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
        el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
        el('div', { class: 'field' }, el('label', { for: 'min', text: 'Implied value' }), min),
        el('div', { class: 'field field-action' }, clear)
      )
    );
  }

  function sortHeader(key, label, cls) {
    var active = state.sort === key;
    return el('th', { scope: 'col', class: cls || null, 'aria-sort': active ? (state.dir < 0 ? 'descending' : 'ascending') : 'none' },
      el('button', { type: 'button', class: active ? 'active' : null, onclick: function () {
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
        writeHash(); render();
      } }, label, el('span', { class: 'arrow', 'aria-hidden': 'true', text: active ? (state.dir < 0 ? '\u2193' : '\u2191') : '\u2195' }))
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) return emptyPanel();
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank' },
          el('span', { class: 'pos-num', text: String(i + 1) }),
          el('span', { class: 'rank-global', text: 'board #' + r.rank })
        ),
        el('td', { class: 'proto' },
          el('div', { class: 'name' },
            el('b', { text: r.name }),
            el('span', { class: 'sub' }, (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'unnamed chain'))
          ),
          r.on_watchlist ? el('span', { class: 'badge', text: 'watchlist floor' }) : el('span', { class: 'badge early', text: 'early find' })
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass(r.change_7d), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.multiple.toFixed(3) + '\u00d7' }),
        el('td', { class: 'implied-cell' },
          el('div', { class: 'implied' },
            el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
            el('span', { class: 'num strong', text: fmtUsd(r.implied_value_usd) })
          ),
          el('div', { class: 'build', title: 'TVL \u00d7 multiple \u00d7 growth \u00d7 maturity' },
            el('span', { class: 'b-base', text: fmtUsd(r.base_value_usd) }),
            el('span', { class: 'b-op', text: '\u00d7' + r.growth_multiplier }),
            el('span', { class: 'b-op', text: '\u00d7' + r.maturity_multiplier })
          )
        ),
        el('td', { class: 'num net', text: '$' + r.net_usd_per_hour.toFixed(2) })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub' }, 'Pre-token protocols, strongest implied value first. Each implied value is its TVL times the multiple, times the growth and maturity terms shown beneath it \u2014 no row is hand-picked. Select a row for the full derivation and the farm plan; sort any column.'),
          el('thead', null, el('tr', null,
            sortHeader('implied', '#', 'num rank'),
            sortHeader('name', 'Protocol', 'proto'),
            sortHeader('tvl', 'TVL', 'num'),
            sortHeader('growth', '7d', 'num'),
            sortHeader('age', 'Age', 'num'),
            sortHeader('multiple', 'Multiple', 'num'),
            sortHeader('implied', 'Implied value', 'implied-cell'),
            sortHeader('net', 'Farm $/hr', 'num net')
          )),
          tbody
        )
      )
    );
  }
  function growthClass(v) { return v === null || v === undefined ? '' : v >= 0 ? 'pos' : 'neg'; }

  function emptyPanel() {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search or pick another category to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
        state.q = ''; state.category = 'all'; state.chain = 'all'; state.min = 0; state.view = 'watch'; writeHash(); render();
      } })
    ));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'live-row' },
        el('td', { class: 'num rank', text: '\u25cf' }),
        el('td', { class: 'proto' }, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub' }, (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain')))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass(r.change_7d), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : r.ratio.toFixed(3) + 'x' }),
        el('td', { class: 'implied-cell' }, el('span', { class: 'status layout', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub' }, 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap-to-TVL multiple is the market\u2019s own answer, and it is what calibrates every pre-token row. They are set aside from the ranking.'),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', class: 'num rank', text: '' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' }),
            el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'num', text: 'mcap / TVL' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model, c = DATA.comps, v = DATA.validation;
    var verdict = v.improvementPct > 0
      ? 'the calibration cuts the typical miss by ' + v.improvementPct.toFixed(1) + '% against one fixed multiple'
      : 'the fit does not beat a fixed multiple on this snapshot';
    var catVerdict = v.categoryGainPct > 0.05
      ? 'the category correction beats the size fit alone by ' + v.categoryGainPct.toFixed(1) + '%'
      : 'the category correction is close to the size fit alone';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'The value model, and its out-of-sample evidence' }),
      el('p', { class: 'sub' }, 'Every row is one function of the snapshot\u2019s own figures. No protocol name is special-cased and no row is hand-picked: the multiple that turns a protocol\u2019s TVL into an implied token value is read from the ' + c.globalSamples + ' protocols that already trade a token in this very snapshot.'),
      el('div', { class: 'formula' },
        'multiple = fit(TVL) \u00d7 (category multiplier / fit)\u1d5c,  fit = 10^(' + c.intercept.toFixed(4) + ' + ' + c.slope.toFixed(4) + ' \u00d7 log10(tvl_usd)),  w = n / (n + ' + m.category_shrinkage + ')\n' +
        'implied = round( tvl_usd \u00d7 multiple \u00d7 (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ')/100 \u00d7 ' + m.growth_weight + ') \u00d7 (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ')/' + m.maturity_days + ' \u00d7 ' + m.maturity_range + ') )'
      ),
      el('div', { class: 'calib' },
        calibCard('Market multiple read off live tokens', c.globalSamples + ' protocols', 'median mcap/TVL ' + c.globalMedian.toFixed(3) + '\u00d7; the fit slopes ' + c.slope.toFixed(3) + ' per 10\u00d7 of TVL, so bigger protocols convert TVL to value at a lower rate'),
        calibCard('Out-of-sample error (leave-one-out)', v.medianAbsLogError.toFixed(3), 'median absolute log error over ' + v.n + ' live protocols: a typical prediction is within ' + Math.exp(v.medianAbsLogError).toFixed(2) + '\u00d7 of the real market cap'),
        calibCard('Versus one fixed multiple', v.baselineTvlOnly.toFixed(3), 'the same test against a single global ' + v.baselineMultiple.toFixed(3) + '\u00d7 multiple, blind to TVL: ' + verdict),
        calibCard('Versus the size fit alone', v.fitOnlyAbsLogError.toFixed(3), 'the fit with no category correction: ' + catVerdict)
      ),
      el('p', { class: 'sub' }, 'TVL and seven-day growth come from the snapshot. Age is how long DefiLlama has tracked the protocol, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol the watchlist leaves out \u2014 below the floor and the ones the list dropped \u2014 ranked by the same model. The ' + DATA.watchlist.derived + ' protocols the rule derives from these ten fields and the ' + DATA.watchlist.listed + ' the snapshot names itself are reconciled below: the snapshot\u2019s list is the floor\u2019s authority and the board covers it whole.'),
      watchAudit()
    );
  }

  // The market's own answer, drawn: every live-token protocol as a dot (its TVL against its
  // market-cap-to-TVL multiple), the log-log fit as a line, and the ranked pre-token rows as marks at
  // their multiple. It is the value model's evidence in one picture, computed from data.js alone.
  function scatterChart() {
    var c = DATA.comps;
    var W = 900, H = 340, padL = 58, padR = 20, padT = 20, padB = 40;
    var pts = [];
    DATA.live.forEach(function (r) {
      if (r.ratio === null || r.tvl_usd <= 0 || r.ratio <= 0) return;
      pts.push({ x: Math.log10(r.tvl_usd), y: Math.log10(r.ratio), live: true });
    });
    DATA.rows.forEach(function (r) {
      if (r.tvl_usd <= 0 || r.multiple <= 0) return;
      pts.push({ x: Math.log10(r.tvl_usd), y: Math.log10(r.multiple), live: false });
    });
    if (!pts.length) return null;
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.max(-2.5, Math.min.apply(null, ys)), maxY = Math.min(3, Math.max.apply(null, ys));
    if (maxX - minX < 0.5) maxX = minX + 0.5;
    var sx = function (x) { return padL + ((x - minX) / (maxX - minX)) * (W - padL - padR); };
    var sy = function (y) { return H - padB - ((y - minY) / (maxY - minY)) * (H - padT - padB); };
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'scatter');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Live-token market cap to TVL multiples by TVL, with the fitted line and the pre-token rows');
    var add = function (tag, attrs) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      svg.appendChild(n);
      return n;
    };
    // Gridlines at whole decades of TVL and of the multiple.
    for (var gx = Math.ceil(minX); gx <= maxX; gx++) {
      add('line', { x1: sx(gx), y1: padT, x2: sx(gx), y2: H - padB, class: 'grid' });
      add('text', { x: sx(gx), y: H - padB + 16, class: 'axis', 'text-anchor': 'middle' }).textContent = '$' + fmtUsd(Math.pow(10, gx)).replace('$', '');
    }
    for (var gy = Math.ceil(minY); gy <= maxY; gy++) {
      add('line', { x1: padL, y1: sy(gy), x2: W - padR, y2: sy(gy), class: 'grid' });
      var mv = Math.pow(10, gy);
      var label = mv >= 1 ? mv.toFixed(0) : mv.toFixed(-gy);
      add('text', { x: padL - 8, y: sy(gy) + 4, class: 'axis', 'text-anchor': 'end' }).textContent = label + '\u00d7';
    }
    // The fitted line over the plotted TVL range.
    add('line', { x1: sx(minX), y1: sy(c.intercept + c.slope * minX), x2: sx(maxX), y2: sy(c.intercept + c.slope * maxX), class: 'fitline' });
    pts.forEach(function (p) {
      add('circle', { cx: sx(p.x), cy: sy(p.y), r: p.live ? 3 : 3.4, class: p.live ? 'dot live' : 'dot pre' });
    });
    add('text', { x: W - padR, y: H - 6, class: 'axis', 'text-anchor': 'end' }).textContent = 'TVL (log scale) \u2192';
    var legend = el('div', { class: 'chart-legend' },
      el('span', { class: 'lg' }, el('i', { class: 'sw live' }), 'live token (market cap / TVL)'),
      el('span', { class: 'lg' }, el('i', { class: 'sw pre' }), 'pre-token row (multiple the model applies)'),
      el('span', { class: 'lg' }, el('i', { class: 'sw line' }), 'fitted line 10^(' + c.intercept.toFixed(2) + ' + ' + c.slope.toFixed(2) + ' \u00d7 log10 TVL)')
    );
    return el('div', { class: 'chart-wrap' }, legend, svg);
  }
  function calibCard(k, big, sub) {
    return el('div', { class: 'calib-card' }, el('span', { class: 'calib-k', text: k }), el('b', { class: 'num', text: big }), el('span', { class: 'sub', text: sub }));
  }
  function watchAudit() {
    var w = DATA.watchlist;
    return el('div', { class: 'audit' },
      el('div', { class: 'audit-row' }, el('b', { class: 'num', text: String(w.derived) }), el('span', { text: 'slugs the brief\u2019s rule keeps from the snapshot\u2019s ten fields' })),
      el('div', { class: 'audit-row' }, el('b', { class: 'num', text: String(w.listed) }), el('span', { text: 'slugs the snapshot\u2019s own watchlist names \u2014 the floor the board must cover' })),
      el('div', { class: 'audit-row' }, el('b', { class: 'num', text: String(w.ruleOnly) }), el('span', { text: 'the rule keeps but the snapshot leaves out: sub-protocols DefiLlama hangs off a parent, a field the ten the snapshot carries omit' })),
      el('div', { class: 'audit-row' }, el('b', { class: 'num', text: w.covered ? 'complete' : 'incomplete' }), el('span', { text: 'every slug the snapshot names is a row on this board' }))
    );
  }

  // ---- Detail drawer --------------------------------------------------------------------------
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row);
    var matches = recomputed === row.implied_value_usd;
    var steps = farmSteps(row);
    var catMultiple = row.category_multiple;

    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rank-line', text: 'Rank ' + row.rank + ' of ' + DATA.rows.length + (row.on_watchlist ? ' \u00b7 on the watchlist floor' : ' \u00b7 found by the early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub' }, (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain'))
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'How the implied value is built' }),
      el('div', { class: 'equation' },
        eqRow('TVL', fmtFull(row.tvl_usd)),
        eqRow('Seven-day growth', fmtPct(row.change_7d)),
        eqRow('Age with no token', fmtAge(row.age_days)),
        eqRow('Size fit for this TVL', row.fit_multiple.toFixed(4) + '\u00d7'),
        eqRow('Category multiple' + (row.basis === 'category' ? ' (' + row.category_samples + ' live ' + (row.category_samples === 1 ? 'token' : 'tokens') + ')' : ''), catMultiple === null ? 'n/a' : catMultiple.toFixed(4) + '\u00d7'),
        eqRow('Category weight (n / (n + ' + DATA.model.category_shrinkage + '))', (row.category_weight * 100).toFixed(1) + '%'),
        eqRow('Multiple applied', row.multiple.toFixed(4) + '\u00d7'),
        eqRow('Base value (TVL \u00d7 multiple)', fmtFull(row.base_value_usd)),
        eqRow('Growth multiplier', String(row.growth_multiplier)),
        eqRow('Maturity multiplier', String(row.maturity_multiplier)),
        eqRow('Implied value', fmtFull(row.implied_value_usd), 'strong')
      ),
      el('p', { class: 'sub' }, 'The maturity term rewards a protocol that has held its TVL for a long time: a launch on a record that has already survived years is more credible than one on a protocol a few months old. The growth and maturity terms move the base value by ' + ((row.growth_multiplier * row.maturity_multiplier - 1) * 100 >= 0 ? '+' : '') + ((row.growth_multiplier * row.maturity_multiplier - 1) * 100).toFixed(1) + '%. Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtFull(recomputed) + (matches ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and the protocol may never issue a token.')
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub' }, 'Concrete steps with what they cost and how long they take. Each step is derived from the protocol\u2019s own record, not written by hand.'),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'equation' },
        eqRow('Capital the position ties up', '$' + row.capital_usd),
        eqRow('Hold before you unwind', row.hold_days + ' days'),
        eqRow('Attention the plan asks for', row.hours + ' hours'),
        eqRow('Implied value per hour of work', '$' + row.net_usd_per_hour.toFixed(2), 'strong')
      ),
      el('p', { class: 'sub' }, 'The per-hour figure is the implied value times an assumed ' + (DATA.airdrop_share * 100) + '% share for one wallet, over the hours the plan asks for. It is an assumption stated so two protocols can be compared, never a promise.')
    ));

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    dialog.scrollTop = 0;
  }
  function eqRow(k, v, cls) {
    return el('div', null, el('span', { text: k }), el('b', { class: 'num ' + (cls || ''), text: v }));
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(heroScope());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.view === 'live' ? liveTable() : boardTable());
    if (state.view !== 'live') {
      var w = workedRow();
      if (w) shell.appendChild(w);
      shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
