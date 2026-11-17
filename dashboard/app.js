// Token Radar dashboard. Reads window.RADAR (written by main.ts as data.js):
// a ranked board of pre-token protocols, a live-token set apart, and the model.
// No fetch, no network: every byte shown is in data.js. Farm plans are built
// here, in the page, from each row's own category, chains, TVL and age — the
// same derivation main.ts writes into board.json.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) { document.getElementById('rows').innerHTML = '<tr><td colspan="7">No data loaded.</td></tr>'; return; }

  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var watchSet = {};
  DATA.watchlist.forEach(function (s) { watchSet[s] = true; });

  var state = {
    view: params.get('view') === 'live' ? 'live' : 'board',
    q: '',
    category: params.get('category') || '',
    chain: '',
    sort: 'value',
    selected: params.get('slug') || null,
  };

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="flat">—</span>';
    var cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }

  // ---- farm plan (client-side twin of lib/model.ts farmSteps) ----
  function capitalFor(tvl) {
    if (tvl >= 5e9) return 500;
    if (tvl >= 1e9) return 250;
    if (tvl >= 1e8) return 150;
    return 100;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('solana') >= 0 || c.indexOf('sui') >= 0 || c.indexOf('aptos') >= 0) return 'under $0.10 of gas';
    if (c.indexOf('ethereum') >= 0) return 'about $5 of gas on Ethereum';
    return 'about $0.50 of gas';
  }
  function mainAction(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $20 against it and repay the borrow after a week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and make one swap through it.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and leave the shares to compound.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small long, then close it after a day.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and hold the receipt token.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then settle it when the market closes.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield-bearing asset on ' + chain + ' and hold it for the full term.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmPlan(row) {
    var chain = row.chains && row.chains.length ? row.chains[0] : 'its main chain';
    var capital = capitalFor(row.tvl_usd);
    var hold = holdFor(row.age_days);
    var gas = gasFor(chain);
    return [
      'Set up a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a chat or a screenshot. Cost: nothing but the wallet. Time: 10 minutes.',
      mainAction(row, capital, chain) + ' Cost: $' + capital + ' of capital and ' + gas + '. Time: 20 minutes to set up.',
      'Use one more feature of ' + row.name + ' on ' + chain + ', such as a swap, a vote or a claim. Cost: ' + gas + '. Time: 10 minutes.',
      'Repeat one qualifying action each week — a deposit, a swap, a vote or a claim — so the wallet shows steady use. Cost: ' + gas + ' a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Cost: the $' + capital + ' stays in the position. Time: ' + hold + ' days.',
      'Before you withdraw, open the protocol\'s own points or rewards page from the link it publishes itself, claim only there, and log every transaction with its date. Cost: no fee to check, and never pay to claim. Time: 15 minutes.',
    ];
  }

  // ---- controls ----
  function fillSelect(el, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
  }
  var cats = [], chains = [];
  DATA.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  fillSelect($('category'), cats.sort());
  fillSelect($('chain'), chains.sort());
  if (state.category) $('category').value = state.category;

  $('q').addEventListener('input', function () { state.q = this.value.trim().toLowerCase(); render(); });
  $('category').addEventListener('change', function () { state.category = this.value; render(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; render(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; render(); });
  $('tab-board').addEventListener('click', function () { setView('board'); });
  $('tab-live').addEventListener('click', function () { setView('live'); });
  function setView(v) {
    state.view = v;
    $('tab-board').setAttribute('aria-selected', v === 'board' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-selected', v === 'live' ? 'true' : 'false');
    render();
  }

  // ---- stats ----
  var top = DATA.rows[0];
  $('stats').innerHTML =
    '<div><dt>Snapshot</dt><dd>' + esc(DATA.as_of) + '</dd></div>' +
    '<div><dt>Board</dt><dd>' + DATA.board_size + ' rows</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + DATA.watchlist_size + '</dd></div>' +
    '<div><dt>Early finds</dt><dd>' + DATA.early_size + '</dd></div>' +
    '<div><dt>Top implied value</dt><dd>' + money(top ? top.implied_value_usd : 0) + '</dd></div>';

  // ---- render ----
  function filteredRows() {
    var rows = DATA.rows.filter(function (r) {
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'age') return (b.age_days || 0) - (a.age_days || 0);
      return b.implied_value_usd - a.implied_value_usd;
    });
    return rows;
  }

  function rowHtml(r) {
    var badge = watchSet[r.slug] ? ' <span class="chip">Watchlist</span>' : '';
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="selected"' : '') + '>' +
      '<td class="rank">' + r.rank + '</td>' +
      '<td><span class="name">' + esc(r.name) + '</span>' + badge + '<span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num value">' + money(r.implied_value_usd) + '</td></tr>';
  }

  function liveHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="rank">—</td>' +
      '<td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + ' · token already trades</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d) + '</td>' +
      '<td class="num value">' + money(r.mcap_usd) + '</td></tr>';
  }

  function render() {
    var body = $('rows');
    if (state.view === 'live') {
      var live = DATA.live.filter(function (r) {
        if (state.category && r.category !== state.category) return false;
        if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
        if (state.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(state.q) < 0) return false;
        return true;
      });
      body.innerHTML = live.map(liveHtml).join('');
      $('empty').hidden = live.length > 0;
      $('hint').textContent = live.length + ' protocols whose token already trades — shown at market capitalisation, never at a modelled value.';
    } else {
      var rows = filteredRows();
      body.innerHTML = rows.map(rowHtml).join('');
      $('empty').hidden = rows.length > 0;
      $('hint').textContent = rows.length + ' of ' + DATA.board_size + ' pre-token protocols · ranked by implied value · watchlist floor $' + (DATA.floor_usd / 1e6) + 'M TVL';
    }
    bindRows();
    renderDetail();
  }

  function bindRows() {
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr'), function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        render();
        var d = $('detail');
        if (d && window.innerWidth < 900) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderDetail() {
    var box = $('detail');
    var row = null;
    if (state.selected) {
      for (var i = 0; i < DATA.rows.length; i++) {
        if (DATA.rows[i].slug === state.selected) { row = DATA.rows[i]; break; }
      }
    }
    if (!row) {
      box.innerHTML = '<p class="detail-empty">Select a protocol to see its model breakdown and farm plan.</p>';
      return;
    }
    var base = Math.round(row.tvl_usd * DATA.model.base_multiple);
    var age = row.age_days === null || row.age_days === undefined ? 'unknown' : row.age_days + ' days';
    var steps = farmPlan(row).map(function (s, i) {
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>';
    }).join('');
    box.innerHTML =
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="sub">Rank #' + row.rank + ' · ' + esc(row.slug) + ' · ' + esc(row.category || 'Uncategorised') + ' · ' + esc((row.chains || []).join(', ') || '—') + (watchSet[row.slug] ? ' · <span class="chip">Watchlist</span>' : '') + '</p>' +
      '<h3>Model breakdown</h3>' +
      '<dl class="kv">' +
      '<dt>Implied value</dt><dd class="big">' + money(row.implied_value_usd) + '</dd>' +
      '<dt>Base (TVL × 0.30)</dt><dd>' + money(base) + '</dd>' +
      '<dt>TVL</dt><dd>' + money(row.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + (row.change_7d === null ? 'not reported' : (row.change_7d > 0 ? '+' : '') + row.change_7d.toFixed(1) + '%') + '</dd>' +
      '<dt>Growth multiplier</dt><dd>×' + row.growth_multiplier.toFixed(2) + '</dd>' +
      '<dt>Maturity multiplier</dt><dd>×' + row.maturity_multiplier.toFixed(2) + '</dd>' +
      '<dt>Breadth multiplier</dt><dd>×' + row.breadth_multiplier.toFixed(2) + '</dd>' +
      '<dt>Tracked with no token</dt><dd>' + age + '</dd>' +
      '</dl>' +
      '<h3>Farm plan</h3><ol>' + steps + '</ol>' +
      '<p class="fine">The snapshot records no token for this protocol — that is not proof none exists. Never pay to claim.</p>';
  }

  setView(state.view);
})();
