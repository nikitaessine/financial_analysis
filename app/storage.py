import os, json, sqlite3, threading, time
from contextlib import contextmanager

DB_PATH = os.environ.get("APP_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS watchlist (
  ticker TEXT NOT NULL,
  market TEXT NOT NULL,
  name   TEXT DEFAULT '',
  PRIMARY KEY (ticker, market)
);
CREATE TABLE IF NOT EXISTS alerts (
  ticker TEXT NOT NULL,
  market TEXT NOT NULL,
  -- rule_type: 'cross_ma200', 'new_52w_high', 'new_52w_low', 'pct_drop_day'
  rule_type TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}', -- JSON
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ticker, market, rule_type)
);
"""

@contextmanager
def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with _conn() as c:
        c.executescript(_SCHEMA)
        c.commit()

# ------ Watchlist ------
def wl_add(ticker, market, name=""):
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO watchlist(ticker, market, name) VALUES(?,?,?)",
                  (ticker, market, name or ""))
        c.commit()

def wl_remove(ticker, market):
    with _conn() as c:
        c.execute("DELETE FROM watchlist WHERE ticker=? AND market=?", (ticker, market))
        c.execute("DELETE FROM alerts WHERE ticker=? AND market=?", (ticker, market))
        c.commit()

def wl_list():
    with _conn() as c:
        cur = c.execute("SELECT ticker, market, name FROM watchlist ORDER BY ticker")
        return [{"ticker": t, "market": m, "name": n} for (t,m,n) in cur.fetchall()]

# ------ Alerts ------
def alerts_set_bulk(ticker, market, rules):
    """
    rules: list of dicts: {rule_type, params (dict), active (bool)}
    """
    with _conn() as c:
        for r in rules:
            c.execute(
                "INSERT OR REPLACE INTO alerts(ticker, market, rule_type, params, active) VALUES(?,?,?,?,?)",
                (ticker, market, r["rule_type"], json.dumps(r.get("params", {})), 1 if r.get("active", True) else 0)
            )
        c.commit()

def alerts_get(ticker):
    with _conn() as c:
        cur = c.execute("SELECT ticker, market, rule_type, params, active FROM alerts WHERE ticker=? ORDER BY rule_type", (ticker,))
        rows = cur.fetchall()
        return [{
            "ticker": r[0], "market": r[1], "rule_type": r[2],
            "params": json.loads(r[3] or "{}"), "active": bool(r[4])
        } for r in rows]

def alerts_all_active():
    with _conn() as c:
        cur = c.execute("SELECT ticker, market, rule_type, params FROM alerts WHERE active=1")
        for t, m, rt, ps in cur.fetchall():
            yield {"ticker": t, "market": m, "rule_type": rt, "params": json.loads(ps or "{}")}
