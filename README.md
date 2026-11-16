# meetfind
pip install -r requirements.txt
uvicorn app:app --reload        # http://localhost:8000

Google Calendar (optional): create OAuth Web client in Google Cloud, enable Calendar API,
add redirect URI $BASE_URL/auth/google/callback, then:
  export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... BASE_URL=https://your.host
Scope used: calendar.freebusy only. Tokens are not stored.
