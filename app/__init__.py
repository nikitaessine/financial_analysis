from __future__ import annotations
from flask import Flask
from .routes import bp as main_bp
from .config import load_config

def create_app() -> Flask:
    app = Flask(__name__)
    load_config(app)
    app.register_blueprint(main_bp)
    return app
