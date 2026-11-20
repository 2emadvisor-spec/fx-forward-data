# fx-forward-data (PRIV)

**FX Forward Desk** (web app, `index.html`, served by GitHub Pages) and its daily feed of **public, free, official** inputs.
App sources, engine and unit tests are in `app/` (`node app/test.js`).
No positions or personal data are stored here.

| Item | Source | Notes |
|---|---|---|
| USD bill curve 4W–52W | U.S. Treasury, Daily Treasury Bill Rates | bank-discount yields, converted exactly to ACT/360 money-market |
| USD O/N | NY Fed SOFR | |
| EUR O/N | ECB €STR | |
| EUR 3M–1Y | ECB AAA euro-area government yield curve (spot, cont. comp.) | |
| GBP O/N | Bank of England SONIA (IADB `IUDSOIA`) | |
| CHF O/N | SNB data portal, SARON | |
| JPY O/N | Bank of Japan, uncollateralized overnight call rate (TONA) | |
| Policy rates | BIS WS_CBPOL | fallback for missing O/N rates |
| Spot snapshot | exchangerate.dev, Coinbase | two independent sources |
| Realised vol | ECB reference rates (Frankfurter mirror) | 20/60/250 days |

`data/latest.json` is written by `.github/workflows/fetch.yml`; `data/latest.sha256` is the SHA-256 of the exact JSON string, verified by the app.
