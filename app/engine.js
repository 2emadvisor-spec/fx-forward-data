/* FX Forward Engine — pure functions, no DOM. Works in browser (window.FXE) and Node (module.exports).
 * Conventions (all explicit, see METHODOLOGY in the app):
 *  - Pair BASE/QUOTE, S = units of QUOTE per 1 BASE.
 *  - Dates are UTC day numbers (days since 1970-01-01).
 *  - Money-market rates are simple rates, decimal, on the currency's MM day-count basis
 *    (ACT/360: USD EUR CHF; ACT/365F: GBP JPY), for a deposit starting on the spot date.
 *  - Outright F(T) = S * (1 + rQ*d/BQ) / (1 + rB*d/BB), d = T - spotDate (calendar days).
 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  // ---------- dates ----------
  function dn(iso) { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); }
  function iso(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
  function ymd(n) { const t = new Date(n * DAY); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
  function mk(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY); }
  function dow(n) { return new Date(n * DAY).getUTCDay(); } // 0 Sun .. 6 Sat
  function isWeekend(n) { const w = dow(n); return w === 0 || w === 6; }
  function lastDayOfMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function nthWeekday(y, m, wd, k) { // k-th weekday wd (0..6) of month m
    let d = mk(y, m, 1); while (dow(d) !== wd) d++; return d + 7 * (k - 1);
  }
  function lastWeekday(y, m, wd) { let d = mk(y, m, lastDayOfMonth(y, m)); while (dow(d) !== wd) d--; return d; }
  function easter(y) { // Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return mk(y, month, day);
  }
  // ---------- holiday calendars (settlement calendars) ----------
  const calCache = {};
  function hol(ccy, y) {
    const key = ccy + y; if (calCache[key]) return calCache[key];
    const s = new Set(); const E = easter(y);
    const add = n => s.add(n);
    if (ccy === 'USD') { // Federal Reserve holidays: Sunday -> Monday; Saturday NOT observed (Fed open Friday)
      const obs = n => { if (dow(n) === 0) add(n + 1); else if (dow(n) !== 6) add(n); };
      obs(mk(y, 1, 1)); add(nthWeekday(y, 1, 1, 3)); add(nthWeekday(y, 2, 1, 3)); add(lastWeekday(y, 5, 1));
      if (y >= 2022) obs(mk(y, 6, 19)); obs(mk(y, 7, 4)); add(nthWeekday(y, 9, 1, 1)); add(nthWeekday(y, 10, 1, 2));
      obs(mk(y, 11, 11)); add(nthWeekday(y, 11, 4, 4)); obs(mk(y, 12, 25));
    } else if (ccy === 'EUR') { // TARGET2 / T2 closing days
      add(mk(y, 1, 1)); add(E - 2); add(E + 1); add(mk(y, 5, 1)); add(mk(y, 12, 25)); add(mk(y, 12, 26));
    } else if (ccy === 'GBP') { // England & Wales bank holidays (rule-based; one-off royal days must be added manually)
      const sub1 = n => { const w = dow(n); return w === 6 ? n + 2 : w === 0 ? n + 1 : n; };
      add(sub1(mk(y, 1, 1))); add(E - 2); add(E + 1); add(nthWeekday(y, 5, 1, 1)); add(lastWeekday(y, 5, 1)); add(lastWeekday(y, 8, 1));
      const c = mk(y, 12, 25), b = mk(y, 12, 26), wc = dow(c);
      if (wc === 5) { add(c); add(b + 2); } // Fri Xmas, Sat Boxing -> Mon 28
      else if (wc === 6) { add(c + 2); add(b + 2); } // Sat/Sun -> Mon 27, Tue 28
      else if (wc === 0) { add(b); add(c + 2); } // Sun Xmas -> Tue 27, Mon 26 Boxing
      else { add(c); add(b); }
    } else if (ccy === 'CHF') { // Zurich banking (SIX SIC) holidays
      add(mk(y, 1, 1)); add(mk(y, 1, 2)); add(E - 2); add(E + 1); add(mk(y, 5, 1)); add(E + 39); add(E + 50);
      add(mk(y, 8, 1)); add(mk(y, 12, 25)); add(mk(y, 12, 26));
    } else if (ccy === 'JPY') { // Tokyo: national holidays + bank holidays Jan 2-3, Dec 31
      const nat = new Set(); const a = n => nat.add(n);
      a(mk(y, 1, 1)); a(nthWeekday(y, 1, 1, 2)); a(mk(y, 2, 11)); if (y >= 2020) a(mk(y, 2, 23));
      const v = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
      const au = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
      a(mk(y, 3, v)); a(mk(y, 4, 29)); a(mk(y, 5, 3)); a(mk(y, 5, 4)); a(mk(y, 5, 5)); a(nthWeekday(y, 7, 1, 3));
      a(mk(y, 8, 11)); a(nthWeekday(y, 9, 1, 3)); a(mk(y, 9, au)); a(nthWeekday(y, 10, 1, 2)); a(mk(y, 11, 3)); a(mk(y, 11, 23));
      const base = [...nat].sort((p, q) => p - q);
      for (const n of base) { if (dow(n) === 0) { let x = n + 1; while (nat.has(x)) x++; nat.add(x); } } // substitute holiday
      for (const n of [...nat]) { if (nat.has(n + 2) && !nat.has(n + 1) && dow(n + 1) !== 0) nat.add(n + 1); } // citizens' holiday
      nat.forEach(add); add(mk(y, 1, 2)); add(mk(y, 1, 3)); add(mk(y, 12, 31));
    }
    calCache[key] = s; return s;
  }
  let extraHolidays = {}; // {CCY: Set(dn)} user-supplied
  function setExtraHolidays(map) { extraHolidays = {}; for (const c in map) extraHolidays[c] = new Set((map[c] || []).map(dn)); }
  function isHoliday(n, ccy) { const y = ymd(n)[0]; return hol(ccy, y).has(n) || (extraHolidays[ccy] && extraHolidays[ccy].has(n)); }
  function isBD(n, ccys) { if (isWeekend(n)) return false; for (const c of ccys) if (isHoliday(n, c)) return false; return true; }
  function following(n, ccys) { while (!isBD(n, ccys)) n++; return n; }
  function modFollowing(n, ccys) { const m = ymd(n)[1]; let x = following(n, ccys); if (ymd(x)[1] !== m) { x = n; while (!isBD(x, ccys)) x--; } return x; }
  function lastBDofMonth(y, m, ccys) { let x = mk(y, m, lastDayOfMonth(y, m)); while (!isBD(x, ccys)) x--; return x; }
  function spotLag(base, quote) { const p = [base, quote].sort().join(''); return (p === 'CADUSD' || p === 'TRYUSD' || p === 'PHPUSD' || p === 'RUBUSD') ? 1 : 2; }
  /** Spot date: count lag business days of the non-USD currencies; the spot date itself must be a business day in base, quote AND USD. */
  function spotDate(trade, base, quote) {
    const nonUSD = [base, quote].filter(c => c !== 'USD'); const cal = nonUSD.length ? nonUSD : ['USD'];
    let d = trade, k = 0; const lag = spotLag(base, quote);
    while (k < lag) { d++; if (isBD(d, cal)) k++; }
    while (!isBD(d, [base, quote, 'USD'])) d++;
    return d;
  }
  /** Value-date calendar for forward dates: both currencies (USD added only via the spot-date rule). */
  function valueCal(base, quote) { return [base, quote]; }
  function addMonths(n, k) { const [y, m, d] = ymd(n); const t = (m - 1) + k; const yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12 + 1; return mk(yy, mm, Math.min(d, lastDayOfMonth(yy, mm))); }
  /** Tenor -> value date from the spot date. Supports ON, TN, SN, nW, nM, nY. Month tenors: modified following + end-of-month rule. */
  function tenorDate(tenor, trade, base, quote) {
    const cal = valueCal(base, quote), sp = spotDate(trade, base, quote), T = String(tenor).toUpperCase().trim();
    if (T === 'SPOT' || T === 'SP') return sp;
    if (T === 'ON') return trade; // value today (cash)
    if (T === 'TN') { let d = trade + 1; while (!isBD(d, cal)) d++; return d; }
    if (T === 'SN') { return following(sp + 1, cal); }
    const m = T.match(/^(\d+)([DWMY])$/); if (!m) throw new Error('Tenor non valido: ' + tenor);
    const q = +m[1], u = m[2];
    if (u === 'D') return following(sp + q, cal);
    if (u === 'W') return following(sp + 7 * q, cal);
    const months = u === 'Y' ? 12 * q : q;
    const [y, mo] = ymd(sp);
    if (sp === lastBDofMonth(y, mo, cal)) { const t = addMonths(mk(y, mo, 1), months); const [yy, mm] = ymd(t); return lastBDofMonth(yy, mm, cal); }
    return modFollowing(addMonths(sp, months), cal);
  }
  // ---------- currency conventions ----------
  const MMBASIS = { USD: 360, EUR: 360, CHF: 360, GBP: 365, JPY: 365, CAD: 365, AUD: 365, NZD: 365, SEK: 360, NOK: 360, DKK: 360, HKD: 365, SGD: 365 };
  function basis(c) { return MMBASIS[c] || 360; }
  function pipSize(base, quote) { return quote === 'JPY' ? 0.01 : 0.0001; }
  // ---------- curves ----------
  /** curve = {ccy, pillars:[{days, rate, label, src}], asOf, quality}; rate simple on basis(ccy). Linear in rate by days; flat extrapolation. */
  function curveRate(curve, days) {
    const p = curve.pillars; if (!p || !p.length) return NaN;
    if (days <= p[0].days) return p[0].rate;
    for (let i = 1; i < p.length; i++) if (days <= p[i].days) { const a = p[i - 1], b = p[i]; return a.rate + (b.rate - a.rate) * (days - a.days) / (b.days - a.days); }
    return p[p.length - 1].rate;
  }
  function makeCurve(ccy, pillars, meta) { const ps = pillars.filter(x => Number.isFinite(x.rate) && x.days > 0).sort((a, b) => a.days - b.days); return Object.assign({ ccy, pillars: ps }, meta || {}); }
  /** US T-bill bank-discount yield (%, ACT/360 discount) -> money-market simple yield ACT/360 (decimal). Exact: P = 1 - d*t/360; y = (1/P - 1)*360/t */
  function tbillToMM(bdPct, days) { const P = 1 - (bdPct / 100) * days / 360; return (1 / P - 1) * 360 / days; }
  const TBILL_DAYS = { '4W': 28, '6W': 42, '8W': 56, '13W': 91, '17W': 119, '26W': 182, '52W': 364 };
  /** ECB continuously-compounded spot rate (%), maturity in years -> simple rate on ACT/360 for days = round(years*365.25). */
  function ccToSimple(zPct, years, B) { const days = Math.round(years * 365.25); const g = Math.exp(zPct / 100 * years); return { days, rate: (g - 1) * B / days }; }
  // ---------- forwards ----------
  function growth(r, d, B) { return 1 + r * d / B; }
  /** Outright for a value date T >= spot: uses rates for d = T - spot. For T < spot (cash/tom) uses overnight rates reversed. */
  function outright(S, d, rB, rQ, BB, BQ) {
    if (d >= 0) return S * growth(rQ, d, BQ) / growth(rB, d, BB);
    const k = -d; return S * growth(rB, k, BB) / growth(rQ, k, BQ);
  }
  /**
   * ctx = {base, quote, spot, spotDate, curveB, curveQ, calib}
   * calib = {leg:'base'|'quote', pillars:[{days, s}]} spread (decimal p.a.) added to that leg's rate (linear by days, flat beyond).
   */
  function calibLeg(base, quote) { if (base === 'USD') return 'quote'; if (quote === 'USD') return 'base'; return 'base'; }
  function spreadAt(calib, days) { if (!calib || !calib.pillars || !calib.pillars.length) return 0; return curveRate({ pillars: calib.pillars.map(p => ({ days: p.days, rate: p.s })) }, days); }
  function ratesAt(ctx, d) {
    const dd = Math.max(1, Math.abs(d));
    let rB = curveRate(ctx.curveB, dd), rQ = curveRate(ctx.curveQ, dd);
    const s = ctx.useCalib === false ? 0 : spreadAt(ctx.calib, dd); const leg = (ctx.calib && ctx.calib.leg) || calibLeg(ctx.base, ctx.quote);
    if (leg === 'base') rB += s; else rQ += s;
    return { rB, rQ, s, leg };
  }
  function fairForward(ctx, T) {
    const d = T - ctx.spotDate, BB = basis(ctx.base), BQ = basis(ctx.quote), r = ratesAt(ctx, d);
    const F = outright(ctx.spot, d, r.rB, r.rQ, BB, BQ);
    return { F, d, rB: r.rB, rQ: r.rQ, s: r.s, leg: r.leg, points: (F - ctx.spot) / pipSize(ctx.base, ctx.quote) };
  }
  /** Discount factor in QUOTE ccy from spot date to T (T>=spot), using the (calibrated) quote-leg rate. */
  function dfQuote(ctx, T) { const d = T - ctx.spotDate; if (d === 0) return 1; const r = ratesAt(ctx, d); if (d < 0) return growth(r.rQ, -d, basis(ctx.quote)); return 1 / growth(r.rQ, d, basis(ctx.quote)); }
  /** Solve the calibration spread so that CIP reproduces a market outright Fm at d days. */
  function solveSpread(S, d, rB, rQ, BB, BQ, Fm, leg) {
    if (leg === 'base') return ((S * growth(rQ, d, BQ) / Fm) - 1) * BB / d - rB;
    return ((Fm * growth(rB, d, BB) / S) - 1) * BQ / d - rQ;
  }
  /** Build calibration from market points: mkt = {spot, points:{days: pts}}. Returns calib object. */
  function calibrate(ctx, mktSpot, ptsByDays) {
    const leg = calibLeg(ctx.base, ctx.quote), pip = pipSize(ctx.base, ctx.quote), BB = basis(ctx.base), BQ = basis(ctx.quote);
    const pillars = Object.keys(ptsByDays).map(Number).filter(d => d >= 7).sort((a, b) => a - b).map(d => {
      const rB = curveRate(ctx.curveB, d), rQ = curveRate(ctx.curveQ, d), Fm = mktSpot + ptsByDays[d] * pip;
      return { days: d, s: solveSpread(mktSpot, d, rB, rQ, BB, BQ, Fm, leg) };
    });
    return { leg, pillars };
  }
  /** Market points interpolation (market convention: linear in points by days from spot; 0 at spot). */
  function interpPoints(ptsByDays, d) {
    const ks = Object.keys(ptsByDays).map(Number).filter(k => k > 0).sort((a, b) => a - b); if (!ks.length) return NaN;
    if (d <= 0) return 0; if (d <= ks[0]) return ptsByDays[ks[0]] * d / ks[0];
    for (let i = 1; i < ks.length; i++) if (d <= ks[i]) { const a = ks[i - 1], b = ks[i]; return ptsByDays[a] + (ptsByDays[b] - ptsByDays[a]) * (d - a) / (b - a); }
    const a = ks[ks.length - 2], b = ks[ks.length - 1]; if (a === undefined) return ptsByDays[b] * d / b; // linear extrapolation on last segment
    return ptsByDays[b] + (ptsByDays[b] - ptsByDays[a]) * (d - b) / (b - a);
  }
  // ---------- trade analytics ----------
  /** sigma: +1 client SELLS base (receives quote), -1 client BUYS base. */
  function sigma(side) { return side === 'SELL' ? 1 : -1; }
  /** MTM of an open forward at fair: value at T = sigma*N*(K - F(T)); PV at spot date = * DFq(spot,T). */
  function mtm(ctx, pos, Fref) {
    const T = pos.T, f = Fref != null ? { F: Fref } : fairForward(ctx, T), sg = sigma(pos.side), cfT = sg * pos.N * (pos.K - f.F), df = dfQuote(ctx, T);
    return { F: f.F, cfT, pv: cfT * df, df, pvBase: cfT * df / ctx.spot };
  }
  /** Early delivery to T1 (T1 < T): exact (P&L discounted) and simplified (swap-points only) rates. */
  function earlyDelivery(ctx, pos, T1, F1, F2) {
    const fT1 = F1 != null ? F1 : fairForward(ctx, T1).F, fT = F2 != null ? F2 : fairForward(ctx, pos.T).F;
    // DF(T1,T) = P(T)/P(T1), P = value at spot date; for T1 < spot, P(T1) = 1 + rQ*(spot-T1)/BQ
    const dfFwd = dfQuote(ctx, pos.T) / dfQuote(ctx, T1);
    const Kexact = fT1 + (pos.K - fT) * dfFwd, Ksimple = pos.K - (fT - fT1);
    return { F1: fT1, F2: fT, dfFwd, Kexact, Ksimple, diff: Kexact - Ksimple, swapPts: (fT - fT1) / pipSize(ctx.base, ctx.quote) };
  }
  function growthBack(ctx, T1) { const k = ctx.spotDate - T1; if (k <= 0) return 1; const r = ratesAt(ctx, k); return growth(r.rQ, k, basis(ctx.quote)); }
  /** Extension (historical-rate rollover) from T to T2 > T. */
  function extension(ctx, pos, T2, F1, F2) {
    const fT = F1 != null ? F1 : fairForward(ctx, pos.T).F, fT2 = F2 != null ? F2 : fairForward(ctx, T2).F;
    const dfFwd = dfQuote(ctx, T2) / dfQuote(ctx, pos.T);
    const Kexact = fT2 + (pos.K - fT) / dfFwd, Ksimple = pos.K + (fT2 - fT);
    return { F1: fT, F2: fT2, dfFwd, Kexact, Ksimple, diff: Kexact - Ksimple, swapPts: (fT2 - fT) / pipSize(ctx.base, ctx.quote), settleNowAlt: sigma(pos.side) * pos.N * (pos.K - fT) };
  }
  /** Bank quote check for a client deal (side from client view). Margin > 0 = cost to client. */
  function bankCheck(o) {
    // o: {side, N, Ffair, Fbank, Smid, Sbank?, Pbank?(pips), Pfair(pips), pip, d}
    const sg = o.side === 'BUY' ? 1 : -1; // client buys base: higher rate = worse
    const m = sg * (o.Fbank - o.Ffair), res = { marginRate: m, marginPips: m / o.pip, money: m * o.N, moneyBase: m * o.N / o.Ffair, bpNotional: m / o.Ffair * 1e4 };
    if (Number.isFinite(o.Sbank) && Number.isFinite(o.Pbank)) {
      res.spotMarginPips = sg * (o.Sbank - o.Smid) / o.pip; res.ptsMarginPips = sg * (o.Pbank - o.Pfair);
      res.consistency = (o.Sbank + o.Pbank * o.pip) - o.Fbank; // should be ~0
      if (o.d > 0) res.ptsMarginBpPa = res.ptsMarginPips * o.pip / o.Smid / (o.d / 360) * 1e4;
    }
    return res;
  }
  /** Rate implied by a bank outright on one leg, holding the other leg at its fair rate. */
  function impliedRate(S, F, d, rOther, BB, BQ, leg) { if (leg === 'quote') return ((F / S) * growth(rOther, d, BB) - 1) * BQ / d; return ((S / F) * growth(rOther, d, BQ) - 1) * BB / d; }
  // ---------- statistics ----------
  function normCdf(x) { // Abramowitz-Stegun 7.1.26 via erf, |err|<1.5e-7
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  function realizedVol(series, n) { // series: array of levels (chronological, business days); annualised with 252
    const s = series.slice(-(n + 1)); if (s.length < 3) return NaN; const r = []; for (let i = 1; i < s.length; i++) r.push(Math.log(s[i] / s[i - 1]));
    const mu = r.reduce((a, b) => a + b, 0) / r.length; const v = r.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (r.length - 1); return Math.sqrt(v * 252);
  }
  /** Lognormal distribution centred on the forward (risk-neutral mean = F). tauYears = ACT/365. */
  function cone(F, vol, tau, z) { const sd = vol * Math.sqrt(tau); return { lo: F * Math.exp(-0.5 * sd * sd - z * sd), hi: F * Math.exp(-0.5 * sd * sd + z * sd) }; }
  function probAbove(F, K, vol, tau) { const sd = vol * Math.sqrt(tau); if (!(sd > 0)) return F > K ? 1 : 0; return normCdf((Math.log(F / K) - 0.5 * sd * sd) / sd); }
  // ---------- market feed -> curves & spots ----------
  const POLICY_KEY = { USD: 'US', EUR: 'XM', GBP: 'GB', CHF: 'CH', JPY: 'JP' };
  const ON_NAME = { USD: 'SOFR', EUR: '€STR', GBP: 'SONIA', CHF: 'SARON', JPY: 'TONA' };
  const MANUAL_DAYS = { ON: 1, '1M': 30, '3M': 91, '6M': 182, '12M': 365 };
  /** mk = fxdata-v1 object; manual = {CCY:{ON:%,1M:%,...}} ; returns {CCY: curve with .meta} */
  function buildCurves(mk, manual) {
    const out = {}; manual = manual || {};
    for (const c of ['USD', 'EUR', 'GBP', 'CHF', 'JPY']) {
      const p = [], src = []; const cv = (mk && mk.curves && mk.curves[c]) || {}; const man = manual[c] || {};
      let quality = 'C';
      if (Number.isFinite(man.ON)) { p.push({ days: 1, rate: man.ON / 100, label: 'O/N', src: 'manuale' }); src.push('O/N manuale'); quality = 'B'; }
      else if (cv.on && Number.isFinite(cv.on.rate)) { p.push({ days: 1, rate: cv.on.rate / 100, label: 'O/N', src: ON_NAME[c] + ' ' + cv.on.date }); src.push(ON_NAME[c] + ' (' + cv.on.date + ')'); quality = 'B'; }
      else { const pk = mk && mk.policy && mk.policy[POLICY_KEY[c]]; if (pk && Number.isFinite(pk.rate)) { p.push({ days: 1, rate: pk.rate / 100, label: 'O/N', src: 'policy BIS ' + pk.date }); src.push('Tasso di policy BIS (' + pk.date + ') come proxy O/N'); } }
      if (c === 'USD' && cv.tbill && cv.tbill.bd) { for (const k in cv.tbill.bd) if (TBILL_DAYS[k]) p.push({ days: TBILL_DAYS[k], rate: tbillToMM(cv.tbill.bd[k], TBILL_DAYS[k]), label: 'T-bill ' + k, src: 'US Treasury ' + cv.tbill.date }); src.push('T-bill 4W–52W (' + cv.tbill.date + ')'); quality = 'A'; }
      if (c === 'EUR' && cv.aaa && cv.aaa.cc) { const Y = { '3M': 0.25, '6M': 0.5, '9M': 0.75, '1Y': 1 }; for (const k in cv.aaa.cc) if (Y[k]) { const q = ccToSimple(cv.aaa.cc[k], Y[k], 360); p.push({ days: q.days, rate: q.rate, label: 'AAA ' + k, src: 'BCE ' + cv.aaa.date }); } src.push('Curva AAA BCE 3M–1Y (' + cv.aaa.date + ')'); quality = 'A'; }
      for (const k of ['1M', '3M', '6M', '12M']) if (Number.isFinite(man[k])) { p.push({ days: MANUAL_DAYS[k], rate: man[k] / 100, label: k + ' man.', src: 'manuale' }); if (quality === 'C' || quality === 'B') quality = 'B'; }
      const ded = []; p.sort((a, b) => a.days - b.days).forEach(x => { const prev = ded[ded.length - 1]; if (prev && prev.days === x.days) ded[ded.length - 1] = x; else ded.push(x); });
      out[c] = makeCurve(c, ded, { quality, src });
    }
    return out;
  }
  function usdRate(mk, c, which) { if (c === 'USD') return 1; const s = mk && mk.spot && mk.spot[which]; return s && s.usd && Number.isFinite(s.usd[c]) ? s.usd[c] : NaN; }
  /** pair mid from feed: average of the two USD-based snapshots; returns {mid, a, b, diffPips, asOf} */
  function feedSpot(mk, base, quote) {
    const vals = []; let asOf = null;
    for (const w of ['exdev', 'coinbase']) { const b = usdRate(mk, base, w), q = usdRate(mk, quote, w); if (Number.isFinite(b) && Number.isFinite(q)) { vals.push(q / b); const a = mk.spot[w] && mk.spot[w].asOf; if (a && (!asOf || a < asOf)) asOf = a; } }
    if (!vals.length) return null; const mid = vals.reduce((x, y) => x + y, 0) / vals.length;
    return { mid, vals, diffPips: vals.length > 1 ? Math.abs(vals[0] - vals[1]) / pipSize(base, quote) : 0, asOf };
  }
  const api = { dn, iso, buildCurves, feedSpot, POLICY_KEY, ON_NAME, ymd, mk, dow, easter, hol, isHoliday, isBD, following, modFollowing, spotDate, tenorDate, valueCal, setExtraHolidays, basis, pipSize,
    curveRate, makeCurve, tbillToMM, TBILL_DAYS, ccToSimple, outright, fairForward, dfQuote, ratesAt, calibLeg, calibrate, solveSpread, spreadAt, interpPoints,
    sigma, mtm, earlyDelivery, extension, bankCheck, impliedRate, normCdf, realizedVol, cone, probAbove, growth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FXE = api;
})(typeof window !== 'undefined' ? window : globalThis);
