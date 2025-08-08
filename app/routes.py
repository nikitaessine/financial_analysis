from __future__ import annotations
from flask import Blueprint, jsonify, render_template, request
import requests
from datetime import datetime, timedelta, timezone
from .polygon_client import poly_get

bp = Blueprint("main", __name__)

@bp.get("/")
def index():
    return render_template("index.html")

@bp.get("/health")
def health():
    return jsonify({"ok": True})

# ---------- Simple in-memory caches (good enough for local/dev) ----------

# (market, ticker) -> {"data": {...}, "ts": epoch_seconds}
SNAPSHOT_CACHE: dict[tuple[str, str], dict] = {}
# (ticker, from, to) -> {"data": {...}, "ts": epoch_seconds}
HISTORY_CACHE: dict[tuple[str, str, str], dict] = {}
# (ticker, days) -> {"data": {...}, "ts": epoch_seconds}
ANALYSIS_CACHE: dict[tuple[str, int], dict] = {}

SNAPSHOT_TTL_SEC = 30          # cache price for 30s
HISTORY_TTL_SEC = 15 * 60      # cache daily history for 15 minutes
ANALYSIS_TTL_SEC = 15 * 60     # cache long history for 15 minutes

# ---------- Helpers ----------

def _now_sec() -> int:
    return int(datetime.now(timezone.utc).timestamp())

def _http_error_payload(prefix: str, e: requests.HTTPError):
    status = e.response.status_code if getattr(e, "response", None) is not None else 500
    body = e.response.text if getattr(e, "response", None) is not None else str(e)
    print(f"[{prefix}] HTTPError {status}: {body}")
    return status, body

def _parse_pair_from_ticker(ticker: str):
    """
    Converts tickers like:
      - Forex: 'C:EURUSD' -> base='EUR', quote='USD'
    Returns (base, quote) or (None, None) if not parseable.
    """
    try:
        if ":" in ticker:
            _, sym = ticker.split(":", 1)
        else:
            sym = ticker
        if len(sym) >= 6:
            base = sym[:-3]
            quote = sym[-3:]
            return base, quote
    except Exception:
        pass
    return None, None

# ---------- API ----------

@bp.get("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    market = request.args.get("market", "stocks").strip() or "stocks"
    if not q:
        return jsonify({"results": []})
    # markets allowed: stocks, indices, fx
    params = {"search": q, "active": "true", "limit": 20, "market": market}
    try:
        data = poly_get("/v3/reference/tickers", params)
        out = [{
            "ticker": it.get("ticker"),
            "name": it.get("name"),
            "market": it.get("market"),
        } for it in data.get("results", [])]
        return jsonify({"results": out})
    except requests.HTTPError as e:
        status, body = _http_error_payload("api_search", e)
        return jsonify({"error": "Polygon request failed", "status": status, "body": body}), status
    except Exception as e:
        print(f"[api_search] Error: {e}")
        return jsonify({"error": str(e)}), 500

def _get_snapshot_price(ticker: str, market: str):
    """
    Free-tier friendly price:
      - Stocks & Indices: previous close via /v2/aggs/ticker/{ticker}/prev
      - Forex:  /v1/last_quote/currencies/{from}/{to} -> mid price
    """
    try:
        if market in ("stocks", "indices"):
            prev = poly_get(f"/v2/aggs/ticker/{ticker}/prev", {"adjusted": "true"})
            if prev.get("results"):
                p = prev["results"][0]
                return {"price": p.get("c"), "timestamp": p.get("t"), "source": "prev_close"}

        elif market in ("fx", "forex"):
            base, quote = _parse_pair_from_ticker(ticker)
            if base and quote:
                q = poly_get(f"/v1/last_quote/currencies/{base}/{quote}")
                last = q.get("last") or {}
                bid = last.get("bid")
                ask = last.get("ask")
                ts = last.get("timestamp")
                mid = None
                if bid is not None and ask is not None:
                    try:
                        mid = (float(bid) + float(ask)) / 2.0
                    except Exception:
                        mid = None
                return {"price": mid or bid or ask, "timestamp": ts, "source": "fx_last_quote"}

    except requests.HTTPError as e:
        status, body = _http_error_payload("snapshot", e)
        return {"error": body, "status": status}

    return {"price": None, "timestamp": None, "note": "No data"}

def _get_history_daily(ticker: str, frm: str, to: str):
    """
    1-day bars (free-tier friendly) for [frm, to], where dates are YYYY-MM-DD.
    """
    path = f"/v2/aggs/ticker/{ticker}/range/1/day/{frm}/{to}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000}
    try:
        data = poly_get(path, params)
        return data
    except requests.HTTPError as e:
        status, body = _http_error_payload("history", e)
        return {"error": body, "status": status, "results": []}

@bp.get("/api/detail")
def api_detail():
    """
    Single call that returns:
      - price (cached 30s)
      - 1-year daily history (cached 15m)
      - % change over the year
    """
    ticker = request.args.get("ticker", type=str)
    market = request.args.get("market", default="stocks", type=str)
    if not ticker:
        return jsonify({"error": "Missing ticker"}), 400

    # Date range: last 365 days
    today = datetime.now(timezone.utc).date()
    year_ago = today - timedelta(days=365)
    frm = year_ago.isoformat()
    to = today.isoformat()

    # Snapshot (cached)
    snap_key = (market, ticker)
    snap_cached = SNAPSHOT_CACHE.get(snap_key)
    if not snap_cached or (_now_sec() - snap_cached["ts"] > SNAPSHOT_TTL_SEC):
        snap_data = _get_snapshot_price(ticker, market)
        SNAPSHOT_CACHE[snap_key] = {"data": snap_data, "ts": _now_sec()}
    else:
        snap_data = snap_cached["data"]

    # History (cached)
    hist_key = (ticker, frm, to)
    hist_cached = HISTORY_CACHE.get(hist_key)
    if not hist_cached or (_now_sec() - hist_cached["ts"] > HISTORY_TTL_SEC):
        hist_data = _get_history_daily(ticker, frm, to)
        HISTORY_CACHE[hist_key] = {"data": hist_data, "ts": _now_sec()}
    else:
        hist_data = hist_cached["data"]

    # Compute % change from first close to last close
    pct_change = None
    results = hist_data.get("results", []) or []
    if len(results) >= 2:
        first = results[0].get("c")
        last = results[-1].get("c")
        if first and last is not None and first != 0:
            try:
                pct_change = (float(last) - float(first)) / float(first) * 100.0
            except Exception:
                pct_change = None

    return jsonify({
        "price": (snap_data or {}).get("price"),
        "timestamp": (snap_data or {}).get("timestamp"),
        "price_source": (snap_data or {}).get("source"),
        "history": [{"t": r.get("t"), "c": r.get("c")} for r in results],
        "pct_change_1y": pct_change,
        "errors": {
            "snapshot": (snap_data or {}).get("error"),
            "history": (hist_data or {}).get("error"),
        }
    })

@bp.get("/api/analysis")
def api_analysis():
    """
    Returns longer daily history for analyses + benchmark for regression.
    Query: ?ticker=TSLA&market=stocks&days=730
    - 'days' defaults to 730 (2 years).
    - Benchmark preference: I:SPX (index). If unavailable, fall back to SPY (ETF).
      If ticker == I:SPX, benchmark is omitted.
    """
    ticker = request.args.get("ticker", type=str)
    market = request.args.get("market", default="stocks", type=str)
    days = request.args.get("days", default=730, type=int)
    if not ticker:
        return jsonify({"error": "Missing ticker"}), 400

    # cache key
    cache_key = (ticker, int(days))
    cached = ANALYSIS_CACHE.get(cache_key)
    if cached and (_now_sec() - cached["ts"] <= ANALYSIS_TTL_SEC):
        return jsonify(cached["data"])

    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days)
    frm = start.isoformat()
    to = today.isoformat()

    # main series
    main_data = _get_history_daily(ticker, frm, to)
    main_series = [{"t": r.get("t"), "c": r.get("c")} for r in (main_data.get("results") or [])]

    # benchmark: try I:SPX first, then SPY
    bench_ticker_used = None
    bench_series = []
    if ticker != "I:SPX":
        # Try index
        bench_data = _get_history_daily("I:SPX", frm, to)
        bench_results = bench_data.get("results") or []
        if bench_results:
            bench_ticker_used = "I:SPX"
            bench_series = [{"t": r.get("t"), "c": r.get("c")} for r in bench_results]
        else:
            # Fallback to ETF proxy
            bench_data2 = _get_history_daily("SPY", frm, to)
            bench_results2 = bench_data2.get("results") or []
            if bench_results2:
                bench_ticker_used = "SPY"
                bench_series = [{"t": r.get("t"), "c": r.get("c")} for r in bench_results2]

    payload = {
        "series": main_series,
        "benchmark": bench_series,
        "benchmark_ticker": bench_ticker_used,
        "ticker": ticker,
        "market": market,
        "days": days
    }

    ANALYSIS_CACHE[cache_key] = {"data": payload, "ts": _now_sec()}
    return jsonify(payload)
