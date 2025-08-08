from __future__ import annotations
from typing import Any, Dict, Optional
from urllib.parse import urlencode
import requests
from flask import current_app

def poly_get(path: str, params: Optional[Dict[str, Any]] = None) -> dict:
    api_key = current_app.config.get("POLYGON_API_KEY")
    base = current_app.config.get("POLYGON_BASE_URL", "https://api.polygon.io")
    if not api_key:
        raise RuntimeError("POLYGON_API_KEY is not set")
    params = dict(params or {})
    params["apiKey"] = api_key
    url = f"{base}{path}?{urlencode(params)}"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    return r.json()
