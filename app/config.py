import os
from dotenv import load_dotenv

def load_config(app):
    load_dotenv()
    app.config["POLYGON_API_KEY"] = os.getenv("POLYGON_API_KEY", "")
    if not app.config["POLYGON_API_KEY"]:
        print("WARNING: POLYGON_API_KEY environment variable is not set. Set it before running.")

    # Alerts worker (enabled by default)
    app.config["ENABLE_ALERTS_WORKER"] = os.getenv("ENABLE_ALERTS_WORKER", "true").lower() != "false"

    # SMTP (for email alerts)
    # Set these in .env; emailer.py will verify presence
    for k in ["SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_PASS","SMTP_STARTTLS","EMAIL_FROM","EMAIL_TO"]:
        app.config[k] = os.getenv(k, "")
