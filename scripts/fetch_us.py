#!/usr/bin/env python3
"""Build a public EOD quote cache. Never query or expose private holdings.
Unofficial Yahoo Finance chart endpoint; network access may be throttled.
"""
import datetime, json, pathlib, time, urllib.request, urllib.error
from urllib.parse import quote
SYMBOLS = "AAPL MSFT NVDA AMZN GOOGL GOOG META TSLA AVGO BRK-B JPM V MA COST NFLX AMD INTC PLTR ORCL KO PEP JNJ WMT DIS XOM CVX VOO VTI IVV SPY QQQ QQQM SCHD VT VEA VWO BND AGG IWM DIA VUG VTV VYM SGOV BIL TLT GLD SLV XLK XLF XLV SMH SOXX".split()
target = pathlib.Path("quotes/us.json")
old = {}
if target.exists():
    try: old = json.loads(target.read_text(encoding="utf-8"))
    except Exception: old = {}
prices, dates, errors = dict(old.get("prices", {})), dict(old.get("dates", {})), []
names = dict(old.get("names", {}))
success = 0
for symbol in SYMBOLS:
    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/" + quote(symbol) + "?interval=1d&range=5d"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=14) as r:
            data = json.load(r)
        record = data["chart"]["result"][0]
        close = record["indicators"]["quote"][0]["close"]
        pairs = [(ts, px) for ts, px in zip(record.get("timestamp", []), close) if isinstance(px, (int, float)) and 0 < px < 1e7]
        if not pairs: raise ValueError("No valid close")
        ts, price = pairs[-1]
        meta = record.get("meta") or {}
        name = meta.get("longName") or meta.get("shortName")
        if isinstance(name, str) and name.strip(): names[symbol] = name.strip()
        prices[symbol] = round(price, 6)
        dates[symbol] = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).date().isoformat()
        success += 1
    except Exception as e:
        errors.append(symbol + ": " + str(e)[:110])
    time.sleep(0.35)
if success < 3:
    raise RuntimeError("Quote provider unavailable: " + "; ".join(errors[:5]))
target.parent.mkdir(parents=True, exist_ok=True)
payload = {"source": "Yahoo Finance chart (unofficial, delayed)", "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "prices": prices, "names": names, "dates": dates, "symbolsCovered": len(prices), "symbolsRequested": len(SYMBOLS), "successfulThisRun": success}
target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print("Updated " + str(success) + " public quotes, retained " + str(len(prices)-success) + "; errors: " + str(errors[:8]))
