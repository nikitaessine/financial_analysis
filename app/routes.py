from __future__ import annotations
from flask import Blueprint, jsonify, render_template, request
import requests
from datetime import datetime, timedelta, timezone
from .polygon_client import poly_get
from . import storage

bp = Blueprint("main", __name__)

@bp.get("/")
def index():
    return render_template("index.html")

@bp.get("/health")
def health():
    return jsonify({"ok": True})

# ---------- Simple in-memory caches ----------
SNAPSHOT_CACHE = {}
HISTORY_CACHE = {}
ANALYSIS_CACHE = {}
SNAPSHOT_TTL_SEC = 30
HISTORY_TTL_SEC = 15 * 60
ANALYSIS_TTL_SEC = 15 * 60

def _now_sec(): import time; return int(time.time())

def _http_error_payload(prefix: str, e: requests.HTTPError):
    status = e.response.status_code if getattr(e, "response", None) is not None else 500
    body = e.response.text if getattr(e, "response", None) is not None else str(e)
    print(f"[{prefix}] HTTPError {status}: {body}")
    return status, body

def _parse_pair_from_ticker(ticker: str):
    try:
        if ":" in ticker: _, sym = ticker.split(":", 1)
        else: sym = ticker
        if len(sym) >= 6:
            return sym[:-3], sym[-3:]
    except Exception:
        pass
    return None, None

@bp.get("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    market = request.args.get("market", "stocks").strip() or "stocks"
    if not q: return jsonify({"results": []})
    params = {"search": q, "active": "true", "limit": 20, "market": market}
    try:
        data = poly_get("/v3/reference/tickers", params)
        out = [{"ticker": it.get("ticker"), "name": it.get("name"), "market": it.get("market")}
               for it in data.get("results", [])]
        return jsonify({"results": out})
    except requests.HTTPError as e:
        status, body = _http_error_payload("api_search", e)
        return jsonify({"error": "Polygon request failed", "status": status, "body": body}), status
    except Exception as e:
        print(f"[api_search] Error: {e}")
        return jsonify({"error": str(e)}), 500

def _get_snapshot_price(ticker: str, market: str):
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
                bid, ask, ts = last.get("bid"), last.get("ask"), last.get("timestamp")
                mid = None
                if bid is not None and ask is not None:
                    try: mid = (float(bid)+float(ask))/2.0
                    except Exception: mid = None
                return {"price": mid or bid or ask, "timestamp": ts, "source": "fx_last_quote"}
    except requests.HTTPError as e:
        status, body = _http_error_payload("snapshot", e)
        return {"error": body, "status": status}
    return {"price": None, "timestamp": None, "note": "No data"}

def _get_history_daily(ticker: str, frm: str, to: str):
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
    ticker = request.args.get("ticker", type=str)
    market = request.args.get("market", default="stocks", type=str)
    if not ticker: return jsonify({"error": "Missing ticker"}), 400
    today = datetime.now(timezone.utc).date()
    frm = (today - timedelta(days=365)).isoformat()
    to = today.isoformat()

    snap_key = (market, ticker)
    snap_cached = SNAPSHOT_CACHE.get(snap_key)
    if not snap_cached or (_now_sec() - snap_cached["ts"] > SNAPSHOT_TTL_SEC):
        snap_data = _get_snapshot_price(ticker, market)
        SNAPSHOT_CACHE[snap_key] = {"data": snap_data, "ts": _now_sec()}
    else:
        snap_data = snap_cached["data"]

    hist_key = (ticker, frm, to)
    hist_cached = HISTORY_CACHE.get(hist_key)
    if not hist_cached or (_now_sec() - hist_cached["ts"] > HISTORY_TTL_SEC):
        hist_data = _get_history_daily(ticker, frm, to)
        HISTORY_CACHE[hist_key] = {"data": hist_data, "ts": _now_sec()}
    else:
        hist_data = hist_cached["data"]

    pct_change = None
    results = hist_data.get("results", []) or []
    if len(results) >= 2:
        first = results[0].get("c"); last = results[-1].get("c")
        if first and last is not None and first != 0:
            try: pct_change = (float(last)-float(first))/float(first)*100.0
            except Exception: pct_change = None

    return jsonify({
        "price": (snap_data or {}).get("price"),
        "timestamp": (snap_data or {}).get("timestamp"),
        "price_source": (snap_data or {}).get("source"),
        "history": [{"t": r.get("t"), "c": r.get("c")} for r in results],
        "pct_change_1y": pct_change,
        "errors": {"snapshot": (snap_data or {}).get("error"), "history": (hist_data or {}).get("error")},
    })

@bp.get("/api/analysis")
def api_analysis():
    """
    ?ticker=TSLA&market=stocks&days=730&benchmark=I:SPX|SPY|I:NDX|QQQ
    """
    ticker = request.args.get("ticker", type=str)
    market = request.args.get("market", default="stocks", type=str)
    days = request.args.get("days", default=730, type=int)
    bench_req = request.args.get("benchmark", default="", type=str).strip()
    if not ticker: return jsonify({"error": "Missing ticker"}), 400

    cache_key = (ticker, int(days), bench_req)
    cached = ANALYSIS_CACHE.get(cache_key)
    if cached and (_now_sec() - cached["ts"] <= ANALYSIS_TTL_SEC):
        return jsonify(cached["data"])

    today = datetime.now(timezone.utc).date()
    frm = (today - timedelta(days=days)).isoformat()
    to = today.isoformat()

    main_data = _get_history_daily(ticker, frm, to)
    main_series = [{"t": r.get("t"), "c": r.get("c")} for r in (main_data.get("results") or [])]

    bench_series = []
    bench_used = None
    if ticker != "I:SPX":
        candidates = []
        if bench_req:
            candidates = [bench_req]
        else:
            candidates = ["I:SPX", "SPY"]  # default preference
        for cand in candidates:
            bd = _get_history_daily(cand, frm, to)
            br = bd.get("results") or []
            if br:
                bench_used = cand
                bench_series = [{"t": r.get("t"), "c": r.get("c")} for r in br]
                break

    payload = {"series": main_series, "benchmark": bench_series, "benchmark_ticker": bench_used,
               "ticker": ticker, "market": market, "days": days}
    ANALYSIS_CACHE[cache_key] = {"data": payload, "ts": _now_sec()}
    return jsonify(payload)

# ---------- Watchlist & Alerts ----------
@bp.get("/api/watchlist")
def wl_list():
    return jsonify({"items": storage.wl_list()})

@bp.post("/api/watchlist")
def wl_add():
    data = request.get_json(silent=True) or {}
    ticker = data.get("ticker"); market = data.get("market", "stocks"); name = data.get("name","")
    if not ticker: return jsonify({"error":"ticker required"}), 400
    storage.wl_add(ticker, market, name)
    return jsonify({"ok": True})

@bp.delete("/api/watchlist")
def wl_del():
    data = request.get_json(silent=True) or {}
    ticker = data.get("ticker"); market = data.get("market","stocks")
    if not ticker: return jsonify({"error":"ticker required"}), 400
    storage.wl_remove(ticker, market)
    return jsonify({"ok": True})

@bp.get("/api/alerts")
def alerts_get():
    ticker = request.args.get("ticker")
    if not ticker: return jsonify({"rules":[]})
    return jsonify({"rules": storage.alerts_get(ticker)})

@bp.post("/api/alerts")
def alerts_set():
    data = request.get_json(silent=True) or {}
    ticker = data.get("ticker"); market = data.get("market","stocks"); rules = data.get("rules",[])
    if not ticker: return jsonify({"error":"ticker required"}), 400
    storage.alerts_set_bulk(ticker, market, rules)
    return jsonify({"ok": True})
