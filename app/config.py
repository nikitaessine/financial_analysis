from __future__ import annotations
import os
from dotenv import load_dotenv

def load_config(app):
    # Load .env first so env vars are available
    load_dotenv()
    app.config["POLYGON_API_KEY"] = os.getenv("POLYGON_API_KEY")
    if not app.config["POLYGON_API_KEY"]:
        print("WARNING: POLYGON_API_KEY environment variable is not set. Set it before running.")
    app.config["POLYGON_BASE_URL"] = "https://api.polygon.io"
    app.config["DEBUG"] = True
