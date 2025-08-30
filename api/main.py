from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import secrets
import time
import socketio
from typing import Optional

from . import db


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
    token = authorization.replace("Bearer", "").strip()
    session = db.get_session_by_token(token)
    if not session:
        raise HTTPException(401, detail="invalid token")
    user = db.get_user_by_id(session["userId"]) if session else None
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
        token = secrets.token_urlsafe(24)
        session = db.upsert_session(existing["id"], token, now)
        return {"user": existing, "token": session["token"]}
    user = db.create_user(body.phone, body.displayName, body.publicKey, now)
    token = secrets.token_urlsafe(24)
    session = db.upsert_session(user["id"], token, now)
    return {"user": user, "token": session["token"]}


@app.post("/api/login")
def login(body: LoginBody):
    user = db.get_user_by_phone(body.phone)
    if not user:
        raise HTTPException(404, detail="user not found")
    token = secrets.token_urlsafe(24)
    session = db.upsert_session(user["id"], token, int(time.time() * 1000))
    return {"user": user, "token": session["token"]}


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

