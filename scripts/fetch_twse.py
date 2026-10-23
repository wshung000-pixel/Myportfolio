#!/usr/bin/env python3
"""Fetch PUBLIC TWSE closing prices for GitHub Pages; never touch private holdings."""
import json, urllib.request, pathlib, datetime, time
URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
request = urllib.request.Request(URL, headers={"User-Agent": "MyWealthQuoteCache/1.0 (GitHub Actions; public market data)", "Accept": "application/json"})
with urllib.request.urlopen(request, timeout=30) as response:
    data = json.load(response)
if not isinstance(data, list) or len(data) < 100:
    raise ValueError("Unexpected TWSE response; refusing to replace quote cache")
prices = {}
for item in data:
    code = str(item.get("Code", "")).strip()
    raw = str(item.get("ClosingPrice", "")).replace(",", "").strip()
    try:
        price = float(raw)
    except (ValueError, TypeError):
        continue
    if code and 0 < price < 10000000:
        prices[code] = round(price, 4)
if len(prices) < 100:
    raise ValueError("Not enough valid prices; refusing to replace quote cache")
target = pathlib.Path("quotes/twse.json")
target.parent.mkdir(parents=True, exist_ok=True)
payload = {"source": "TWSE STOCK_DAY_ALL", "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "prices": prices}
target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Saved {len(prices)} TWSE quotes")
