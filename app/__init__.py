import os, threading, time
from datetime import datetime, timedelta, timezone
from flask import Flask
from .config import load_config
from .routes import bp
from .polygon_client import poly_get
from . import storage
from .emailer import send_email, email_enabled

def create_app():
    app = Flask(__name__)
    load_config(app)
    storage.init_db()
    app.register_blueprint(bp)

    # ---- Send a startup test email ----
    if email_enabled():
        try:
            ok, info = send_email(
                subject="[Market Watcher] Startup OK",
                body="Your Polygon Market Watcher just started successfully. If you see this, SMTP is working."
            )
            print(f"[startup-email] sent={ok} info={info}")
        except Exception as e:
            print(f"[startup-email] error: {e}")
    else:
        print("[startup-email] Email not enabled (check SMTP_* and EMAIL_TO in .env).")

    # ---- Start alerts worker (background) ----
    if app.config.get("ENABLE_ALERTS_WORKER", True) and email_enabled():
        t = threading.Thread(target=_alerts_worker, args=(app,), daemon=True)
        t.start()
        print("[alerts] worker thread started")
    else:
        print("[alerts] worker disabled or email not enabled")

    return app

def _day_agg_range(days):
    today = datetime.now(timezone.utc).date()
    frm = (today - timedelta(days=days)).isoformat()
    to = today.isoformat()
    return frm, to

def _get_daily_history(ticker, days=400):
    frm, to = _day_agg_range(days)
    path = f"/v2/aggs/ticker/{ticker}/range/1/day/{frm}/{to}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000}
    try:
        data = poly_get(path, params)
        return data.get("results") or []
    except Exception as e:
        print(f"[alerts] history error for {ticker}: {e}")
        return []

def _sma(vals, window):
    out=[]; s=0; q=[]
    for v in vals:
        q.append(v); s += v
        if len(q)>window: s -= q.pop(0)
        out.append(s/len(q) if len(q)>=window else None)
    return out

def _alerts_worker(app: Flask):
    interval = int(os.environ.get("ALERTS_INTERVAL_SEC", "900"))  # 15 min default
    email_to = os.environ.get("EMAIL_TO", "")  # use EMAIL_TO from .env
    print(f"[alerts] worker started, interval={interval}s, email_enabled={email_enabled()} to={email_to or '(default)'}")
    while True:
        try:
            from . import storage  # lazy import to avoid circulars
            tickers = list({ (a["ticker"], a["market"]) for a in storage.alerts_all_active() })
            if tickers:
                print(f"[alerts] checking {len(tickers)} symbols")
            for (ticker, market) in tickers:
                rows = _get_daily_history(ticker, days=400)
                if len(rows) < 250:
                    time.sleep(1)
                    continue
                closes = [r.get("c") for r in rows if r.get("c") is not None]
                if not closes:
                    time.sleep(1)
                    continue
                cur = closes[-1]
                high52 = max(closes[-365:])
                low52  = min(closes[-365:])
                ma200_series = _sma(closes, 200)
                ma200 = ma200_series[-1] if ma200_series and ma200_series[-1] is not None else None

                for rule in storage.alerts_get(ticker):
                    if not rule["active"]:
                        continue
                    rt = rule["rule_type"]; params = rule.get("params") or {}
                    fire = False; msg = ""
                    if rt == "new_52w_high" and cur >= high52:
                        fire = True; msg = f"{ticker} made a new 52-week HIGH. Price {cur:.2f} reached ≥ {high52:.2f}."
                    elif rt == "new_52w_low" and cur <= low52:
                        fire = True; msg = f"{ticker} made a new 52-week LOW. Price {cur:.2f} ≤ {low52:.2f}."
                    elif rt == "cross_ma200" and ma200 is not None:
                        prev = closes[-2] if len(closes) >= 2 else None
                        prev_ma = ma200_series[-2] if len(ma200_series) >= 2 else None
                        if prev is not None and prev_ma is not None:
                            crossed_up   = prev < prev_ma and cur >= ma200
                            crossed_down = prev > prev_ma and cur <= ma200
                            if crossed_up or crossed_down:
                                direction = "UP" if crossed_up else "DOWN"
                                fire = True; msg = f"{ticker} crossed {direction} through MA200 ({ma200:.2f}). Price {cur:.2f}."
                    elif rt == "pct_drop_day":
                        thresh = float(params.get("percent", 3))
                        if len(closes) >= 2 and closes[-2] != 0:
                            drop = (cur - closes[-2]) / closes[-2] * 100.0
                            if drop <= -abs(thresh):
                                fire = True; msg = f"{ticker} dropped {drop:.2f}% today (≤ {thresh}%)."

                    if fire:
                        subj = f"[Alert] {ticker} – {rt.replace('_',' ').title()}"
                        try:
                            ok, info = send_email(subj, msg, to=email_to or None)
                            print(f"[alerts] {ticker} {rt}: sent={ok} info={info}")
                        except Exception as e:
                            print(f"[alerts] email error: {e}")

                time.sleep(1)  # be gentle with rate limits
        except Exception as e:
            print(f"[alerts] worker error: {e}")
        time.sleep(interval)
