const E=require('./engine.js'), fs=require('fs');
const snap=require('./validation_snapshot_2026-11-19.json');
const seed={schema:'fxdata-v1',generatedAt:'2026-11-19T13:00:00Z',seedNote:'Istantanea iniziale raccolta il 19/11/2026 da fonti ufficiali (browser). Sostituita automaticamente dal feed giornaliero.',
 curves:{USD:{on:{date:'2026-11-18',rate:3.90,src:'https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json'},tbill:{date:'2026-11-18',bd:snap.curves['USD_tbill_bank_discount_2026-11-18'],src:'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_bill_rates'}},
  EUR:{on:{date:'2026-11-18',rate:2.442,src:'https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT'},aaa:{date:'2026-11-18',cc:{'3M':2.6565701198,'6M':2.8021354076,'9M':2.9041009576,'1Y':2.9743472892},src:'https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_3M+SR_6M+SR_9M+SR_1Y'}},
  GBP:{on:null},CHF:{on:null},JPY:{on:null}},
 policy:{CH:{date:'2026-11-17',rate:0},GB:{date:'2026-11-16',rate:4},JP:{date:'2026-11-17',rate:1.25},US:{date:'2026-11-17',rate:3.875},XM:{date:'2026-11-17',rate:2.5},src:'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.CH+GB+JP+US+XM'},
 spot:{exdev:{asOf:'2026-11-19T12:40:59Z',usd:{EUR:0.91015,CHF:0.84286,GBP:0.76007,JPY:159.943},src:'https://api.exchangerate.dev/v1/latest/USD'},coinbase:{asOf:'2026-11-19T12:56:27Z',usd:{EUR:0.9096076303452627,CHF:0.842536,GBP:0.7599921666666667,JPY:159.9121666666666667},src:'https://api.coinbase.com/v2/exchange-rates?currency=USD'}},
 vol:{asOf:'2026-11-18',obs:312,method:'stdev log-rendimenti giornalieri cambi di riferimento BCE x sqrt(252)',EURUSD:{v20:0.05791,v60:0.05025,v250:0.05565},USDCHF:{v20:0.06432,v60:0.06193,v250:0.06931},EURCHF:{v20:0.04232,v60:0.05326,v250:0.03837},GBPUSD:{v20:0.05637,v60:0.04969,v250:0.06075},EURGBP:{v20:0.02314,v60:0.02734,v250:0.0306},USDJPY:{v20:0.04825,v60:0.07703,v250:0.07566}},
 errors:['SONIA/SARON/TONA non disponibili nella istantanea iniziale: usato tasso di policy BIS']};
const curves=E.buildCurves(seed,{});
const NAMES={ON:'ON',TN:'TN',SN:'SN','1W':'1W','2W':'2W','3W':'3W','1M':'1M','2M':'2M','3M':'3M','6M':'6M','9M':'9M','1Y':'1Y'};
const factory={};
for(const pair of Object.keys(snap.market_fxempire)){const m=snap.market_fxempire[pair],b=pair.slice(0,3),q=pair.slice(3);
 const trade=E.dn(m.asof.slice(0,10)),sp=E.spotDate(trade,b,q);const ctx={base:b,quote:q,spot:m.spot,spotDate:sp,curveB:curves[b],curveQ:curves[q]};
 const pts={};for(const t in m.pts){pts[E.tenorDate(t,trade,b,q)-sp]=m.pts[t]}
 const cal=E.calibrate(ctx,m.spot,pts);const curveRef={};for(const d in pts){curveRef[d]={rB:E.curveRate(curves[b],+d),rQ:E.curveRate(curves[q],+d)}}
 factory[pair]={asOf:m.asof.replace('Z',':00Z'),source:'FXEmpire, punti mid (calibrazione iniziale)',spot:m.spot,spotDate:E.iso(sp),ptsByDays:pts,leg:cal.leg,pillars:cal.pillars,curveRef};
 // verify
 ctx.calib=cal;for(const d in pts){const f=E.fairForward(ctx,sp+ +d);if(Math.abs(f.points-pts[d])>1e-9)throw Error('calib '+pair)}
}
fs.writeFileSync('seed.json',JSON.stringify(seed));fs.writeFileSync('factory.json',JSON.stringify(factory));
console.log('ok',JSON.stringify(seed).length,JSON.stringify(factory).length);
console.log(Object.entries(curves).map(([c,v])=>c+':'+v.quality+':'+v.pillars.map(p=>p.days+'='+(p.rate*100).toFixed(3)).join(',')).join('\n'));
const fs2=E.feedSpot(seed,'EUR','USD');console.log('EURUSD feed',fs2);
