FastAPI backend

Install deps in venv (requires python3-venv):

- python3 -m venv .venv
- source .venv/bin/activate
- pip install -r requirements.txt
- uvicorn api.main:app_with_sockets --host 0.0.0.0 --port 4000

