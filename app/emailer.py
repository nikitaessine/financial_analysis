import os, smtplib
from email.mime.text import MIMEText

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_STARTTLS = os.environ.get("SMTP_STARTTLS", "true").lower() != "false"
EMAIL_FROM = os.environ.get("EMAIL_FROM", SMTP_USER or "alerts@localhost")
EMAIL_TO_DEFAULT = os.environ.get("EMAIL_TO", "")

def email_enabled():
    return bool(SMTP_HOST and (SMTP_USER or os.environ.get("SMTP_ALLOW_ANON", "false").lower()=="true"))

def send_email(subject, body, to=None):
    to = to or EMAIL_TO_DEFAULT
    if not to:
        return False, "No recipient configured"
    if not email_enabled():
        return False, "Email not enabled (missing SMTP env)"
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = to
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
        if SMTP_STARTTLS:
            try:
                s.starttls()
            except Exception:
                pass
        if SMTP_USER:
            s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(EMAIL_FROM, [to], msg.as_string())
    return True, "sent"
