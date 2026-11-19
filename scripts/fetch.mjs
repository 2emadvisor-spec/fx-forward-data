// Daily public-rates feed for the FX Forward Desk (PRIV). Node >= 20, no dependencies.
// Every value carries its source URL and observation date. Missing sources are recorded in `errors`, never invented.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const UA = { 'User-Agent': 'Mozilla/5.0 (fx-forward-data; personal research feed)', 'Accept': '*/*' };
const errors = [], debug = {};
async function get(url, kind = 'text', timeout = 60000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(url, { headers: UA, signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return kind === 'json' ? await r.json() : await r.text(); }
  finally { clearTimeout(t); }
}
async function safe(name, fn) { try { return await fn(); } catch (e) { errors.push(name + ': ' + (e.message || e)); return null; } }
const num = x => { const n = Number(String(x).trim()); return Number.isFinite(n) ? n : null; };
const isoFromUS = s => { const [m, d, y] = s.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const now = new Date(), Y = now.getUTCFullYear();

// ---------- USD: US Treasury daily bill rates (bank discount) ----------
async function tbills() {
  for (const y of [Y, Y - 1]) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_bill_rates`;
    const t = await get(url); const lines = t.trim().split(/\r?\n/); if (lines.length < 2) continue;
    const head = lines[0].split(',').map(s => s.replace(/"/g, '').trim()); const row = lines[1].split(',');
    const bd = {};
    for (const w of ['4', '6', '8', '13', '17', '26', '52']) { const i = head.indexOf(`${w} WEEKS BANK DISCOUNT`); if (i > 0) { const v = num(row[i]); if (v != null) bd[w + 'W'] = v; } }
    return { date: isoFromUS(row[0]), bd, src: url, note: 'Bank-discount yields; converted in app: P=1-d*t/360, y=(1/P-1)*360/t' };
  }
  throw new Error('no rows');
}
// ---------- USD: SOFR (NY Fed) ----------
async function sofr() { const url = 'https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json'; const j = await get(url, 'json'); const r = j.refRates[0]; return { date: r.effectiveDate, rate: r.percentRate, src: url }; }
// ---------- ECB SDMX helpers ----------
function ecbSeries(j) {
  const dims = j.structure.dimensions.series, times = j.structure.dimensions.observation[0].values.map(v => v.id), out = {};
  for (const [k, s] of Object.entries(j.dataSets[0].series)) {
    const key = k.split(':').map((ix, di) => dims[di].values[+ix].id).join('.');
    const obs = Object.entries(s.observations).map(([i, o]) => [times[+i], o[0]]).sort();
    out[key] = obs;
  }
  return out;
}
async function estr() { const url = 'https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?lastNObservations=1&format=jsondata'; const s = Object.values(ecbSeries(await get(url, 'json', 90000)))[0]; const [d, v] = s[s.length - 1]; return { date: d, rate: v, src: url }; }
async function ecbAAA() {
  const url = 'https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_3M+SR_6M+SR_9M+SR_1Y?lastNObservations=1&format=jsondata';
  const s = ecbSeries(await get(url, 'json', 90000)); const cc = {}; let date = null;
  for (const [k, obs] of Object.entries(s)) { const tenor = k.split('.').pop().replace('SR_', ''); const [d, v] = obs[obs.length - 1]; cc[tenor] = v; date = d; }
  return { date, cc, src: url, note: 'Continuously-compounded spot rates, AAA euro-area government curve (Svensson)' };
}
// ---------- BIS central bank policy rates ----------
async function bis() {
  const url = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.CH+GB+JP+US+XM?lastNObservations=1&format=csv';
  const t = await get(url); const split = l => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
  const lines = t.trim().split(/\r?\n/); const h = split(lines[0]);
  const ia = h.indexOf('REF_AREA'), it = h.indexOf('TIME_PERIOD'), iv = h.indexOf('OBS_VALUE'); const out = {};
  for (const l of lines.slice(1)) { const c = split(l); if (c[ia]) out[c[ia]] = { date: c[it], rate: num(c[iv]) }; }
  return { ...out, src: url };
}
// ---------- GBP: SONIA (Bank of England IADB) ----------
async function sonia() {
  const from = new Date(now.getTime() - 20 * 864e5); const df = `${String(from.getUTCDate()).padStart(2, '0')}/${Object.keys(MON)[from.getUTCMonth()]}/${from.getUTCFullYear()}`;
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${df}&Dateto=now&SeriesCodes=IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const t = await get(url); debug.sonia = t.slice(0, 300);
  const rows = t.trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(c => c.length >= 2 && num(c[1]) != null);
  if (!rows.length) throw new Error('no rows');
  const parse = s => { const m = s.trim().match(/^(\d{1,2}) (\w{3}) (\d{4})$/); return m ? `${m[3]}-${MON[m[2]]}-${m[1].padStart(2, '0')}` : s; };
  const last = rows.map(c => [parse(c[0]), num(c[1])]).sort((a, b) => a[0] < b[0] ? -1 : 1).pop();
  return { date: last[0], rate: last[1], src: url };
}
// ---------- CHF: SARON (SNB data portal) ----------
async function saron() {
  for (const cube of ['zirepo', 'snbgwdzid', 'zimoma']) {
    const url = `https://data.snb.ch/api/cube/${cube}/data/csv/en`;
    try {
      const t = await get(url); debug['snb_' + cube] = t.slice(0, 400);
      const lines = t.split(/\r?\n/).filter(l => l.includes(';'));
      const hi = lines.findIndex(l => /^"?Date"?;/i.test(l)); if (hi < 0) continue;
      const head = lines[hi].split(';').map(s => s.replace(/"/g, ''));
      const rows = lines.slice(hi + 1).map(l => l.split(';').map(s => s.replace(/"/g, '')));
      const dIdx = head.findIndex(h => /Date/i.test(h)), vIdx = head.findIndex(h => /Value/i.test(h)), kIdx = head.findIndex(h => /D0/i.test(h));
      const sar = rows.filter(r => kIdx >= 0 ? /SARON/i.test(r[kIdx]) : true).filter(r => num(r[vIdx]) != null);
      if (sar.length) { const last = sar.sort((a, b) => a[dIdx] < b[dIdx] ? -1 : 1).pop(); return { date: last[dIdx], rate: num(last[vIdx]), src: url, series: kIdx >= 0 ? last[kIdx] : cube }; }
    } catch (e) { debug['snb_' + cube + '_err'] = String(e.message); }
  }
  throw new Error('SARON not found in candidate cubes');
}
// ---------- JPY: TONA (BoJ Time-Series Data Search API) ----------
async function tona() {
  const ym = `${Y}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const url = `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=FM01&startDate=${Y - 1}${String(now.getUTCMonth() + 1).padStart(2, '0')}&code=STRDCLUCON`;
  const j = await get(url, 'json'); debug.boj = JSON.stringify(j).slice(0, 400);
  const res = (j.RESULTSET || j.resultset || [])[0]; if (!res) throw new Error('no RESULTSET');
  const dates = res.VALUES?.SURVEY_DATES || res.VALUES?.survey_dates, vals = res.VALUES?.VALUES || res.VALUES?.values;
  let i = vals.length - 1; while (i >= 0 && num(vals[i]) == null) i--;
  const d = String(dates[i]); return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, rate: num(vals[i]), src: url, ym };
}
// ---------- Spot snapshot (two independent sources) ----------
async function spotExdev() { const url = 'https://api.exchangerate.dev/v1/latest/USD'; const j = await get(url, 'json'); const pick = {}; for (const c of ['EUR', 'CHF', 'GBP', 'JPY']) pick[c] = j.rates[c]; return { asOf: j.effective_at?.EUR || j.timestamp, usd: pick, src: url }; }
async function spotCoinbase() { const url = 'https://api.coinbase.com/v2/exchange-rates?currency=USD'; const j = await get(url, 'json'); const pick = {}; for (const c of ['EUR', 'CHF', 'GBP', 'JPY']) pick[c] = Number(j.data.rates[c]); return { asOf: new Date().toISOString(), usd: pick, src: url }; }
// ---------- Realised volatility from ECB reference rates (Frankfurter mirror) ----------
async function vols() {
  const start = new Date(now.getTime() - 420 * 864e5).toISOString().slice(0, 10);
  const url = `https://api.frankfurter.dev/v1/${start}..?base=EUR&symbols=USD,CHF,GBP,JPY`;
  const j = await get(url, 'json'); const days = Object.keys(j.rates).sort();
  const ser = p => days.map(d => { const r = j.rates[d]; const v = c => c === 'EUR' ? 1 : r[c]; return v(p.slice(3)) / v(p.slice(0, 3)); });
  const vol = (s, n) => { s = s.slice(-(n + 1)); const r = []; for (let i = 1; i < s.length; i++) r.push(Math.log(s[i] / s[i - 1])); const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252); };
  const out = { asOf: days[days.length - 1], obs: days.length, src: url, method: 'stdev of daily log-returns of ECB 14:15 CET reference rates x sqrt(252)' };
  for (const p of ['EURUSD', 'USDCHF', 'EURCHF', 'GBPUSD', 'EURGBP', 'USDJPY']) { const s = ser(p); out[p] = { v20: +vol(s, 20).toFixed(5), v60: +vol(s, 60).toFixed(5), v250: +vol(s, 250).toFixed(5), ref: +s[s.length - 1].toFixed(6) }; }
  return out;
}

const [tb, sf, es, aaa, pol, so, sa, to, sx, sc, vo] = await Promise.all([
  safe('tbills', tbills), safe('sofr', sofr), safe('estr', estr), safe('ecbAAA', ecbAAA), safe('bis', bis),
  safe('sonia', sonia), safe('saron', saron), safe('tona', tona), safe('spotExdev', spotExdev), safe('spotCoinbase', spotCoinbase), safe('vols', vols)]);

const data = {
  schema: 'fxdata-v1', generatedAt: new Date().toISOString(),
  curves: { USD: { on: sf, tbill: tb }, EUR: { on: es, aaa }, GBP: { on: so }, CHF: { on: sa }, JPY: { on: to } },
  policy: pol, spot: { exdev: sx, coinbase: sc }, vol: vo, errors,
};
const raw = JSON.stringify(data);
const sha256 = createHash('sha256').update(raw, 'utf8').digest('hex');
mkdirSync('data', { recursive: true });
writeFileSync('data/latest.json', raw + '\n');
writeFileSync('data/latest.sha256', sha256 + '\n');
writeFileSync('data/debug.json', JSON.stringify(debug, null, 1));
console.log(JSON.stringify({ sha256, bytes: raw.length, errors }, null, 1));
