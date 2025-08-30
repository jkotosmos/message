from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import secrets
import time
import socketio
from typing import Optional
from fastapi.staticfiles import StaticFiles
import os
from pywebpush import webpush, WebPushException

from . import db
from . import auth


app = FastAPI(title="NeonTalk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"]
    ,
    allow_headers=["*"]
)


class RegisterBody(BaseModel):
    phone: str
    displayName: str
    publicKey: str


class LoginBody(BaseModel):
    phone: str


class PostMessageBody(BaseModel):
    recipientId: str
    ciphertext: str
    nonce: str


def auth_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(401, detail="missing authorization")
    bearer = authorization.replace("Bearer", "").strip()
    payload = auth.verify_access_token(bearer)
    if not payload:
        raise HTTPException(401, detail="invalid token")
    user = db.get_user_by_id(payload["sub"]) if payload else None
    if not user:
        raise HTTPException(401, detail="user not found")
    return user


@app.on_event("startup")
def on_startup():
    db.init_db()


@app.post("/api/register")
def register(body: RegisterBody):
    existing = db.get_user_by_phone(body.phone)
    now = int(time.time() * 1000)
    if existing:
        access = auth.issue_access_token(existing["id"])
        refresh = auth.issue_refresh_token()
        db.upsert_session(existing["id"], refresh, now)
        return {"user": existing, "accessToken": access, "refreshToken": refresh}
    user = db.create_user(body.phone, body.displayName, body.publicKey, now)
    access = auth.issue_access_token(user["id"])
    refresh = auth.issue_refresh_token()
    db.upsert_session(user["id"], refresh, now)
    return {"user": user, "accessToken": access, "refreshToken": refresh}


@app.post("/api/login")
def login(body: LoginBody):
    user = db.get_user_by_phone(body.phone)
    if not user:
        raise HTTPException(404, detail="user not found")
    access = auth.issue_access_token(user["id"])
    refresh = auth.issue_refresh_token()
    db.upsert_session(user["id"], refresh, int(time.time() * 1000))
    return {"user": user, "accessToken": access, "refreshToken": refresh}


class RefreshBody(BaseModel):
    refreshToken: str


@app.post("/api/token/refresh")
def refresh_token(body: RefreshBody):
    sess = db.get_session_by_token(body.refreshToken)
    if not sess:
        raise HTTPException(401, detail="invalid refresh")
    user = db.get_user_by_id(sess["userId"])
    if not user:
        raise HTTPException(401, detail="user not found")
    return {"accessToken": auth.issue_access_token(user["id"])}


@app.get("/api/me")
def me(user=Depends(auth_user)):
    return {"user": user}


@app.get("/api/users")
def users(_=Depends(auth_user)):
    return {"users": db.list_users()}


@app.get("/api/users/{user_id}/key")
def user_key(user_id: str, _=Depends(auth_user)):
    u = db.get_user_by_id(user_id)
    if not u:
        raise HTTPException(404, detail="not found")
    return {"publicKey": u["publicKey"]}


@app.get("/api/messages/{peer_id}")
def get_messages(peer_id: str, user=Depends(auth_user)):
    messages = db.list_messages(user["id"], peer_id)
    return {"messages": messages}


@app.post("/api/messages")
def post_message(body: PostMessageBody, user=Depends(auth_user)):
    stored = db.store_message(user["id"], body.recipientId, body.ciphertext, body.nonce, int(time.time() * 1000))
    sio_server.emit("message:new", stored, to=f"user:{body.recipientId}")
    # Web Push to recipient
    for sub in db.list_push_subs(body.recipientId):
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                },
                data="{\"type\":\"message\"}",
                vapid_private_key=VAPID_PRIVATE_KEY_PEM,
                vapid_claims={"sub": VAPID_EMAIL},
            )
        except WebPushException:
            pass
    return {"message": stored}


sio_server = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


@sio_server.event
async def connect(sid, environ):
    pass


@sio_server.event
async def auth(sid, data):
    user_id = data.get("userId")
    if user_id:
        await sio_server.save_session(sid, {"userId": user_id})
        await sio_server.enter_room(sid, f"user:{user_id}")


@sio_server.event
async def disconnect(sid):
    pass


@sio_server.event
async def call_offer(sid, data):
    sess = await sio_server.get_session(sid)
    from_user = sess.get("userId") if sess else None
    to_user = data.get("toUserId")
    sdp = data.get("sdp")
    if from_user and to_user and sdp:
        await sio_server.emit("call:offer", {"fromUserId": from_user, "sdp": sdp}, room=f"user:{to_user}")


@sio_server.event
async def call_answer(sid, data):
    sess = await sio_server.get_session(sid)
    from_user = sess.get("userId") if sess else None
    to_user = data.get("toUserId")
    sdp = data.get("sdp")
    if from_user and to_user and sdp:
        await sio_server.emit("call:answer", {"fromUserId": from_user, "sdp": sdp}, room=f"user:{to_user}")


@sio_server.event
async def call_ice(sid, data):
    sess = await sio_server.get_session(sid)
    from_user = sess.get("userId") if sess else None
    to_user = data.get("toUserId")
    cand = data.get("candidate")
    if from_user and to_user and cand:
        await sio_server.emit("call:ice", {"fromUserId": from_user, "candidate": cand}, room=f"user:{to_user}")


app_with_sockets = socketio.ASGIApp(sio_server, other_asgi_app=app)

# Static media
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=UPLOAD_DIR), name="media")


@app.post("/api/media")
async def upload_media(file: UploadFile = File(...), user=Depends(auth_user)):
    filename = f"{int(time.time() * 1000)}_{os.path.basename(file.filename)}"
    dest = os.path.join(UPLOAD_DIR, filename)
    with open(dest, "wb") as f:
        f.write(await file.read())
    return {"url": f"/media/{filename}"}


# Web Push VAPID setup
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

VAPID_EMAIL = os.environ.get("VAPID_EMAIL", "mailto:admin@example.com")
VAPID_PRIVATE_KEY_PEM = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY_PEM = os.environ.get("VAPID_PUBLIC_KEY", "")

if not VAPID_PRIVATE_KEY_PEM or not VAPID_PUBLIC_KEY_PEM:
    _key = ec.generate_private_key(ec.SECP256R1())
    VAPID_PRIVATE_KEY = _key
    VAPID_PRIVATE_KEY_PEM = _key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    VAPID_PUBLIC_KEY_PEM = _key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
else:
    VAPID_PRIVATE_KEY = serialization.load_pem_private_key(VAPID_PRIVATE_KEY_PEM.encode(), password=None)


def _public_key_base64_from_pem(pem: str) -> str:
    # Return base64-url encoded raw public key for PushManager
    from cryptography.hazmat.primitives.serialization import load_pem_public_key, Encoding, PublicFormat
    from base64 import urlsafe_b64encode
    pub = load_pem_public_key(pem.encode())
    raw = pub.public_bytes(encoding=Encoding.X962, format=PublicFormat.UncompressedPoint)
    return urlsafe_b64encode(raw).decode().rstrip("=")


@app.get("/api/push/vapid-public")
def get_vapid_public():
    return {"key": _public_key_base64_from_pem(VAPID_PUBLIC_KEY_PEM)}


class PushSubBody(BaseModel):
    endpoint: str
    keys: dict


@app.post("/api/push/subscribe")
def push_subscribe(body: PushSubBody, user=Depends(auth_user)):
    now = int(time.time() * 1000)
    db.upsert_push_sub(user["id"], body.endpoint, body.keys.get("p256dh", ""), body.keys.get("auth", ""), now)
    return {"ok": True}

