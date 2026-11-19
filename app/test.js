const E = require('./engine.js');
let pass = 0, fail = 0;
function eq(name, got, exp, tol) {
  const ok = tol != null ? Math.abs(got - exp) <= tol : got === exp;
  if (ok) pass++; else { fail++; console.log('FAIL', name, 'got', got, 'exp', exp); }
}
const D = E.dn, I = E.iso;
const holList = (c, y) => [...E.hol(c, y)].sort((a, b) => a - b).map(I);
// ---- Easter
eq('easter 2026', I(E.easter(2026)), '2026-04-05'); eq('easter 2027', I(E.easter(2027)), '2027-03-28'); eq('easter 2024', I(E.easter(2024)), '2024-03-31');
// ---- Japan 2026 (Cabinet Office list) + bank holidays
const jp = holList('JPY', 2026);
const jpExp = ['2026-01-01','2026-01-02','2026-01-03','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23','2026-12-31'];
eq('JP 2026 list', JSON.stringify(jp), JSON.stringify(jpExp));
// Japan 2027: Mar 21 equinox (Sun) -> Mar 22 substitute; Sep 23 autumn
const jp27 = holList('JPY', 2027); eq('JP 2027 vernal', jp27.includes('2027-03-21') && jp27.includes('2027-03-22'), true); eq('JP 2027 autumn', jp27.includes('2027-09-23'), true);
// ---- USD 2026 Fed
eq('USD 2026', JSON.stringify(holList('USD', 2026)), JSON.stringify(['2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25']));
eq('USD 2027 Jul4 Sun->Mon', holList('USD', 2027).includes('2027-07-05'), true);
// ---- TARGET 2026
eq('EUR 2026', JSON.stringify(holList('EUR', 2026)), JSON.stringify(['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-25','2026-12-26']));
// ---- UK 2026 (gov.uk): Jan1, Apr3, Apr6, May4, May25, Aug31, Dec25, Dec28
eq('GBP 2026', JSON.stringify(holList('GBP', 2026)), JSON.stringify(['2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-08-31','2026-12-25','2026-12-28']));
// UK 2027: Dec 25 Sat -> Mon 27, Boxing Sun -> Tue 28
eq('GBP 2027 xmas', holList('GBP', 2027).filter(x => x >= '2027-12-01').join(','), '2027-12-27,2027-12-28');
// ---- CHF 2026
eq('CHF 2026', JSON.stringify(holList('CHF', 2026)), JSON.stringify(['2026-01-01','2026-01-02','2026-04-03','2026-04-06','2026-05-01','2026-05-14','2026-05-25','2026-08-01','2026-12-25','2026-12-26']));
// ---- Spot dates
eq('spot EURUSD Thu 19 Nov', I(E.spotDate(D('2026-11-19'), 'EUR', 'USD')), '2026-11-23');
eq('spot EURUSD Wed 25 Nov (T+1 US holiday counts)', I(E.spotDate(D('2026-11-25'), 'EUR', 'USD')), '2026-11-27');
eq('spot EURCHF Tue 24 Nov (spot on US holiday rolls)', I(E.spotDate(D('2026-11-24'), 'EUR', 'CHF')), '2026-11-27');
eq('spot USDJPY Fri 18 Sep 2026 (JP Golden week Sept)', I(E.spotDate(D('2026-09-18'), 'USD', 'JPY')), '2026-09-25');
eq('spot GBPUSD Thu 24 Dec 2026', I(E.spotDate(D('2026-12-24'), 'GBP', 'USD')), '2026-12-30');
// ---- Tenors
eq('3M from 19 Nov', I(E.tenorDate('3M', D('2026-11-19'), 'EUR', 'USD')), '2027-02-23');
eq('1Y from 19 Nov', I(E.tenorDate('1Y', D('2026-11-19'), 'EUR', 'USD')), '2027-11-23');
eq('1W', I(E.tenorDate('1W', D('2026-11-19'), 'EUR', 'USD')), '2026-11-30');
// EOM: trade Thu 26 Nov 2026 EURUSD -> spot? 27 is Fri (EUR BD, USD BD) -> T+1=27, T+2=30 Mon -> spot 30 Nov = last BD of Nov -> 1M = 31 Dec, 3M = last BD Feb 2027 = 26 Feb
eq('spot 26 Nov', I(E.spotDate(D('2026-11-26'), 'EUR', 'USD')), '2026-11-30');
eq('EOM 1M', I(E.tenorDate('1M', D('2026-11-26'), 'EUR', 'USD')), '2026-12-31');
eq('EOM 3M', I(E.tenorDate('3M', D('2026-11-26'), 'EUR', 'USD')), '2027-02-26');
// Modified following: spot Fri 30 Apr 2027? use a non-EOM case rolling into next month: spot 2026-12-29? -> 1M = 29 Jan 2027 (Fri) ok.
eq('Easter 2027 spot (Good Fri + Easter Mon TARGET)', I(E.spotDate(D('2027-03-25'), 'EUR', 'USD')), '2027-03-31');
eq('EOM after Easter', I(E.tenorDate('1M', D('2027-03-25'), 'EUR', 'USD')), '2027-04-30');
eq('MF: 29 May Sat, 31 May US Memorial -> back to 28 May', I(E.tenorDate('1M', D('2027-04-27'), 'EUR', 'USD')), '2027-05-28');
// ---- T-bill conversion (hand calc)
eq('tbill 13W', E.tbillToMM(4.16, 91), 0.0420421, 2e-7);
// exact formula check: P = 1 - 0.0416*91/360
const P = 1 - 0.0416 * 91 / 360; eq('tbill identity', E.tbillToMM(4.16, 91), (1 / P - 1) * 360 / 91, 1e-15);
// ---- ECB cc conversion
const c3 = E.ccToSimple(2.6565701198, 0.25, 360); eq('cc days', c3.days, 91); eq('cc rate', c3.rate, (Math.exp(0.026565701198 * 0.25) - 1) * 360 / 91, 1e-15);
// ---- Build curves from snapshot and price EUR/USD vs market
const snap = require('./validation_snapshot_2026-11-19.json');
function usdCurve() { const t = snap.curves['USD_tbill_bank_discount_2026-11-18']; const p = [{ days: 1, rate: 0.039 }]; for (const k in t) p.push({ days: E.TBILL_DAYS[k], rate: E.tbillToMM(t[k], E.TBILL_DAYS[k]) }); return E.makeCurve('USD', p); }
function eurCurve() { const a = snap.curves['EUR_AAA_spot_cc_2026-11-18']; const y = { '3M': 0.25, '6M': 0.5, '9M': 0.75, '1Y': 1 }; const p = [{ days: 1, rate: 0.02442 }]; for (const k in a) { const c = E.ccToSimple(a[k], y[k], 360); p.push(c); } return E.makeCurve('EUR', p); }
const flat = (c, r) => E.makeCurve(c, [{ days: 1, rate: r }]);
const curves = { USD: usdCurve(), EUR: eurCurve(), CHF: flat('CHF', 0), GBP: flat('GBP', 0.04), JPY: flat('JPY', 0.0125) };
const trade = D('2026-11-19');
const tenDays = {};
for (const pair of ['EURUSD', 'USDCHF', 'EURCHF', 'GBPUSD', 'EURGBP', 'USDJPY']) {
  const b = pair.slice(0, 3), q = pair.slice(3), m = snap.market_fxempire[pair], sp = E.spotDate(trade, b, q);
  const ctx = { base: b, quote: q, spot: m.spot, spotDate: sp, curveB: curves[b], curveQ: curves[q] };
  const pts = {}; const rows = [];
  for (const t of ['1W', '1M', '2M', '3M', '6M', '9M', '1Y']) { const T = E.tenorDate(t, trade, b, q); const d = T - sp; pts[d] = m.pts[t]; const f = E.fairForward(ctx, T); rows.push(t + ' d=' + d + ' CIP=' + f.points.toFixed(2) + ' mkt=' + m.pts[t] + ' diff=' + (f.points - m.pts[t]).toFixed(2)); }
  console.log(pair, 'spot', I(sp)); console.log('  ' + rows.join('\n  '));
  // calibrate and verify exact reproduction at pillars
  ctx.calib = E.calibrate(ctx, m.spot, pts);
  console.log('  calib spread bp:', ctx.calib.leg, ctx.calib.pillars.map(p => p.days + ':' + (p.s * 1e4).toFixed(1)).join(' '));
  for (const d in pts) { const f = E.fairForward(ctx, sp + Number(d)); eq(pair + ' calib reprod d=' + d, f.points, pts[d], 1e-9); }
  tenDays[pair] = { ctx, pts, sp };
}
// ---- Hand-check EUR/USD 3M pure CIP
{ const { ctx, sp } = tenDays.EURUSD; const c0 = Object.assign({}, ctx, { useCalib: false }); const f = E.fairForward(c0, D('2027-02-23'));
  const rU = E.curveRate(curves.USD, 92), rE = E.curveRate(curves.EUR, 92); const Fh = 1.09936 * (1 + rU * 92 / 360) / (1 + rE * 92 / 360);
  eq('EURUSD 3M hand', f.F, Fh, 1e-12); }
// ---- Early delivery / extension value equivalence (PV identity)
{ const { ctx } = tenDays.EURUSD; const pos = { side: 'SELL', N: 1e6, K: 1.1150, T: D('2027-05-24') };
  const T1 = D('2027-01-25'); const ed = E.earlyDelivery(ctx, pos, T1);
  const pvOrig = E.mtm(ctx, pos).pv, pvNew = E.mtm(ctx, { ...pos, K: ed.Kexact, T: T1 }).pv; eq('early delivery PV identity', pvNew, pvOrig, 1e-6);
  const posB = { side: 'BUY', N: 2e6, K: 1.0900, T: D('2027-05-24') }; const edB = E.earlyDelivery(ctx, posB, T1);
  eq('early delivery PV identity BUY', E.mtm(ctx, { ...posB, K: edB.Kexact, T: T1 }).pv, E.mtm(ctx, posB).pv, 1e-6);
  const T2 = D('2027-11-23'); const ex = E.extension(ctx, pos, T2);
  eq('extension PV identity', E.mtm(ctx, { ...pos, K: ex.Kexact, T: T2 }).pv, pvOrig, 1e-6);
  // early delivery to before spot (cash): T1 = trade date
  const edC = E.earlyDelivery(ctx, pos, trade); eq('early delivery cash PV identity', E.mtm(ctx, { ...pos, K: edC.Kexact, T: trade }).pv, pvOrig, 1e-6);
  // MTM sign: SELL base at K above market forward -> positive
  const mt = E.mtm(ctx, { side: 'SELL', N: 1e6, K: 1.12, T: D('2027-02-23') }); eq('mtm sign', mt.cfT > 0, true); eq('mtm cf', mt.cfT, 1e6 * (1.12 - mt.F), 1e-6);
}
// ---- Calibrated vs interpolated market points at a broken date should be close
{ const { ctx, pts, sp } = tenDays.EURUSD; const T = D('2027-04-15'); const d = T - sp; const a = E.fairForward(ctx, T).points, b = E.interpPoints(pts, d); console.log('broken date', I(T), 'calibCIP', a.toFixed(3), 'linear pts', b.toFixed(3)); eq('broken close (interp. convention gap)', a, b, 1.0); }
// ---- Bank check synthetic
{ const r = E.bankCheck({ side: 'BUY', N: 1e6, Ffair: 1.10384, Fbank: 1.10584, Smid: 1.09936, Sbank: 1.10086, Pbank: 49.8, Pfair: 44.8, pip: 1e-4, d: 92 });
  eq('bank margin pips', r.marginPips, 20, 1e-9); eq('bank money', r.money, 2000, 1e-6); eq('spot margin', r.spotMarginPips, 15, 1e-9); eq('pts margin', r.ptsMarginPips, 5, 1e-9); eq('consistency', r.consistency, 0, 1e-12);
  const s = E.bankCheck({ side: 'SELL', N: 1e6, Ffair: 1.10384, Fbank: 1.10184, Smid: 1.09936, pip: 1e-4, d: 92 }); eq('sell margin', s.marginPips, 20, 1e-9); }
// ---- Implied rate round trip
{ const S = 1.09936, d = 92, rE = 0.026, F = E.outright(S, d, rE, 0.042, 360, 360); eq('implied quote rate', E.impliedRate(S, F, d, rE, 360, 360, 'quote'), 0.042, 1e-12); eq('implied base rate', E.impliedRate(S, F, d, 0.042, 360, 360, 'base'), rE, 1e-12); }
// ---- Stats
eq('normCdf(0)', E.normCdf(0), 0.5, 1e-7); eq('normCdf(1.96)', E.normCdf(1.96), 0.9750021, 2e-7); eq('normCdf(-1)', E.normCdf(-1), 0.1586553, 2e-7);
{ const c = E.cone(1.1, 0.08, 0.25, 1); const mean = 1.1; eq('cone median below F', c.lo < mean && c.hi > mean, true); eq('probAbove ATM-forward <0.5', E.probAbove(1.1, 1.1, 0.08, 0.25) < 0.5, true); }
console.log('\nPASS', pass, 'FAIL', fail);
process.exit(fail ? 1 : 0);
