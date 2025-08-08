<<<<<<< HEAD
# Polygon Market Watcher (Modular Flask)

A small Flask app (modular structure) that searches tickers via Polygon, shows a latest price (best-effort), and renders a 1-day sparkline from minute aggregates.

## Structure
```
polygon-market-watcher/
  app/
    __init__.py          # app factory
    config.py            # loads .env and settings
    routes.py            # HTML + API endpoints
    polygon_client.py    # Polygon HTTP helper
    templates/
      index.html         # UI shell
    static/
      app.js             # frontend logic
      styles.css         # styling
  app.py                 # entry point
  requirements.txt
  .env.example
  README.md
```

## Quick start (Windows + Git Bash / VS Code)
```bash
python -m venv .venv
source .venv/Scripts/activate     # activate venv in Git Bash
pip install -r requirements.txt

cp .env.example .env
# open .env and set your key:
# POLYGON_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

python app.py
# open http://localhost:5000
```

## Notes
- Key is used **server-side** only.
- If you see a red banner after searching, check the Flask console — it prints the upstream Polygon error body (e.g., entitlement/plan issues).

## Next steps
- Add alert rules + notifications (Telegram/Email).
- Add watchlists and multi-interval charts.
=======
# financial_analysis
>>>>>>> e4dd1a1083859ee0d54c7a055b73b49cce615cd3
