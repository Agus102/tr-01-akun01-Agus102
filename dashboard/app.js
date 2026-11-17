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
  function roundTripGas(p) {
    var chains = Math.max(1, Math.min(p.chains ? p.chains.length : 1, 5));
    var base = p.tvl_usd >= 1e9 ? 6 : p.tvl_usd >= 1e8 ? 4 : 3;
    return base + chains;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('credit') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as a lender, then borrow a small amount against it to count as a borrower too.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Provide $" + capital + " of liquidity to " + name + "'s deepest pool on " + chain + ' and leave it in for the whole window.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('perps') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open and close one small perpetual or basis position.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC to ' + chain + " through " + name + "'s bridge and use the funds inside its own app, not only in transit.";
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('liquid staking') >= 0) return "Stake $" + capital + " of the chain's native asset through " + name + ' on ' + chain + ' and keep the receipt token in the wallet.';
    if (c.indexOf('prediction') >= 0) return 'Fund the account with $' + capital + ' and place one small market on ' + name + ', then leave the position open until it resolves.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('asset management') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('treasury') >= 0) return "Mint or buy $" + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in the wallet.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it through the window.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active through the window.';
    if (c.indexOf('options') >= 0) return 'Write one small covered option with $' + capital + ' of collateral on ' + name + ' on ' + chain + '.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open for the window.';
  }
  function secondaryFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Repay part of the borrow and take it out again, so repayment and withdrawal both show.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Move the position between two pools once, or place a limit order, so trading volume shows as well as liquidity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('perps') >= 0 || c.indexOf('derivative') >= 0) return 'Close the position and open a smaller one, so a settled trade and a fresh one both show.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small second amount back out through ' + p.name + ', so both directions of the bridge show.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking reward once and re-stake it, so the claim and the restake both show.';
    if (c.indexOf('prediction') >= 0) return 'Place a second, opposite position on another market so two resolved positions show.';
    return 'Make one swap or one small deposit in a second pool on ' + chain + ' so two contracts show activity.';
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
    return [
      { text: 'Open ' + p.name + "'s own site and its docs or points page, and confirm on that page what counts as activity before you spend anything.", cost: 'free to check, and never pay a fee to qualify', time: '20 minutes of reading' },
      { text: 'Use a fresh wallet that holds only the funds you plan to farm on ' + chain + ', and keep its seed phrase offline.', cost: 'about $3 of gas to fund the wallet', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of round-trip gas', time: '20 minutes to set up' },
      { text: 'Make one more qualifying action: ' + secondaryFor(p, chain), cost: 'about $' + Math.max(2, Math.round(gas / 2)) + ' of gas', time: '15 minutes' },
      { text: 'Keep the position and one action a week open for at least ' + hold + " days, so the activity is counted in more than one snapshot of the protocol's TVL.", cost: 'the $' + capital + ' stays in the position, and about $2 of gas a week', time: hold + ' days, 10 minutes a week' },
      { text: "Before you withdraw, open the protocol's own rewards page and claim only from the link that page publishes; then write the wallet, the dates and every transaction in a farm log.", cost: 'no fee to check or to claim, and nothing to keep the log', time: '15 minutes to claim and log' }
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

  function lede() {
    return el('section', { class: 'lede' },
      el('div', { class: 'lede-copy' },
        el('h1', { text: 'Pre-token protocols, ranked by what a launch would be worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record, minus the wrapped, staked and bridged products of tokens that already trade. The radar adds the ' + DATA.early_size + ' pre-token protocols below that floor, so the board finds the early ones too. Implied value is a model, not a promise: a protocol may never issue a token, and this snapshot records none yet.' })
      ),
      el('div', { class: 'facts' },
        fact('Watchlist covered', DATA.watchlist.covered ? DATA.watchlist.listed + ' / ' + DATA.watchlist.listed : DATA.watchlist.listed + ' listed'),
        fact('Protocols scanned', String(DATA.rows.length)),
        fact('Early rows below the floor', String(DATA.early_size)),
        fact('Live tokens set aside', String(DATA.live_size))
      )
    );
  }
  function fact(k, v) {
    return el('div', { class: 'fact' }, el('span', { text: k }), el('b', { class: 'num', text: v }));
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
      viewTabs(),
      el('div', { class: 'fields' },
        el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
        el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
        el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
        el('div', { class: 'field' }, el('label', { for: 'min', text: 'Implied value' }), min)
      ),
      el('div', { class: 'controls-foot' },
        el('span', { class: 'count', text: shown + (state.view === 'live' ? ' live-token protocols' : ' rows shown') }),
        clear
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
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank' }, String(r.rank)),
        el('td', { class: 'proto' },
          el('div', { class: 'name' },
            el('b', { text: r.name }),
            el('span', { class: 'sub' }, (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'unnamed chain'))
          ),
          r.on_watchlist ? el('span', { class: 'badge', text: 'watchlist' }) : null
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass(r.change_7d), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.multiple.toFixed(3) + 'x' }),
        el('td', { class: 'implied-cell' },
          el('div', { class: 'implied' },
            el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
            el('span', { class: 'num strong', text: fmtUsd(r.implied_value_usd) })
          )
        ),
        el('td', { class: 'num net', text: '$' + r.net_usd_per_hour.toFixed(2) })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub' }, 'Pre-token protocols, strongest implied value first. Select a row for the model\u2019s inputs and the farm plan. Sort any column.'),
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
        calibCard('Market multiple read off live tokens', c.globalSamples + ' protocols', 'median mcap/TVL ' + c.globalMedian.toFixed(3) + 'x; the fit slopes ' + c.slope.toFixed(3) + ' per 10\u00d7 of TVL, so bigger protocols convert TVL to value at a lower rate'),
        calibCard('Out-of-sample error (leave-one-out)', v.medianAbsLogError.toFixed(3), 'median absolute log error over ' + v.n + ' live protocols: a typical prediction is within ' + Math.exp(v.medianAbsLogError).toFixed(2) + '\u00d7 of the real market cap'),
        calibCard('Versus one fixed multiple', v.baselineTvlOnly.toFixed(3), 'the same test against a single global ' + v.baselineMultiple.toFixed(3) + 'x multiple, blind to TVL: ' + verdict),
        calibCard('Versus the size fit alone', v.fitOnlyAbsLogError.toFixed(3), 'the fit with no category correction: ' + catVerdict)
      ),
      el('p', { class: 'sub' }, 'TVL and seven-day growth come from the snapshot. Age is how long DefiLlama has tracked the protocol, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL. The ' + DATA.watchlist.derived + ' protocols the rule derives from these ten fields and the ' + DATA.watchlist.listed + ' the snapshot names itself are reconciled below: the snapshot\u2019s list is the floor\u2019s authority and the board covers it whole.'),
      watchAudit()
    );
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
        eqRow('Size fit for this TVL', row.fit_multiple.toFixed(4) + 'x'),
        eqRow('Category multiple' + (row.basis === 'category' ? ' (' + row.category_samples + ' live ' + (row.category_samples === 1 ? 'token' : 'tokens') + ')' : ''), catMultiple === null ? 'n/a' : catMultiple.toFixed(4) + 'x'),
        eqRow('Category weight (n / (n + ' + DATA.model.category_shrinkage + '))', (row.category_weight * 100).toFixed(1) + '%'),
        eqRow('Multiple applied', row.multiple.toFixed(4) + 'x'),
        eqRow('Growth multiplier', String(row.growth_multiplier)),
        eqRow('Maturity multiplier', String(row.maturity_multiplier)),
        eqRow('Implied value', fmtFull(row.implied_value_usd), 'strong')
      ),
      el('p', { class: 'sub' }, 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtFull(recomputed) + (matches ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and the protocol may never issue a token.')
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
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.view === 'live' ? liveTable() : boardTable());
    if (state.view !== 'live') shell.appendChild(modelPanel());
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
