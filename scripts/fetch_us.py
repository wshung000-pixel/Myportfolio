#!/usr/bin/env python3
"""Public US EOD prices for a FIXED list, never derived from a user's private assets.
Prices are unadjusted/possibly vendor-adjusted daily closes: informational only.
"""
import csv, io, json, pathlib, datetime, urllib.request, time
SYMBOLS = "AAPL MSFT NVDA AMZN GOOGL GOOG META TSLA AVGO BRK.B JPM V MA COST NFLX AMD INTC PLTR ORCL KO PEP JNJ WMT DIS XOM CVX VOO VTI IVV SPY QQQ QQQM SCHD VT VEA VWO BND AGG IWM DIA VUG VTV VYM SGOV BIL TLT GLD SLV XLK XLF XLV SMH SOXX".split()
prices, dates, failed = {}, {}, []
for sym in SYMBOLS:
    ticker=sym.lower().replace(".", "-")+".us"
    url="https://stooq.com/q/d/l/?s="+ticker+"&i=d&d1="+(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=16)).strftime("%Y%m%d")
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; PersonalWealthPublicQuotes/1.0)"})
        with urllib.request.urlopen(req,timeout=12) as r:
            raw=r.read().decode("utf-8-sig")
        rows=list(csv.DictReader(io.StringIO(raw)))
        valid=[row for row in rows if row.get("Date") and row.get("Close") and row["Close"] not in ("N/D","0")]
        if not valid: raise ValueError("no valid close")
        row=valid[-1]; px=float(row["Close"])
        if px<=0 or not (px<1e7): raise ValueError("bad price")
        prices[sym]=round(px,6);dates[sym]=row["Date"]
    except Exception as e:
        failed.append(sym+": "+str(e)[:75])
    time.sleep(0.16)
if len(prices)<5:
    raise RuntimeError("Only "+str(len(prices))+" quotes. Refusing to replace existing public cache. "+str(failed[:4]))
target=pathlib.Path("quotes/us.json")
target.parent.mkdir(parents=True,exist_ok=True)
payload={"source":"Stooq public daily historical CSV","fetchedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"prices":prices,"dates":dates,"symbolsCovered":len(prices),"symbolsRequested":len(SYMBOLS)}
target.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
print("US quotes saved: "+str(len(prices))+"/"+str(len(SYMBOLS))+"; failed: "+str(failed))
