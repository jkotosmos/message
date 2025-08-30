import sqlite3
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional
from uuid import uuid4
import os


DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "data.sqlite"))


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _get_conn()
    cur = conn.cursor()
    cur.executescript(
        """
        create table if not exists users (
          id text primary key,
          phone text not null unique,
          displayName text not null,
          publicKey text not null,
          createdAt integer not null
        );
        create table if not exists sessions (
          id text primary key,
          userId text not null,
          token text not null unique,
          createdAt integer not null,
          foreign key(userId) references users(id)
        );
        create table if not exists messages (
          id text primary key,
          senderId text not null,
          recipientId text not null,
          ciphertext text not null,
          nonce text not null,
          createdAt integer not null,
          foreign key(senderId) references users(id),
          foreign key(recipientId) references users(id)
        );
        """
    )
    conn.commit()
    conn.close()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def create_user(phone: str, display_name: str, public_key: str, now_ms: int) -> Dict[str, Any]:
    user = {
        "id": str(uuid4()),
        "phone": phone,
        "displayName": display_name,
        "publicKey": public_key,
        "createdAt": now_ms,
    }
    conn = _get_conn()
    conn.execute(
        "insert into users (id, phone, displayName, publicKey, createdAt) values (:id,:phone,:displayName,:publicKey,:createdAt)",
        user,
    )
    conn.commit()
    conn.close()
    return user


def get_user_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.execute("select * from users where phone = ?", (phone,))
    row = cur.fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.execute("select * from users where id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def list_users() -> List[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.execute("select * from users order by createdAt desc")
    rows = [
        _row_to_dict(r) for r in cur.fetchall()
    ]
    conn.close()
    return rows


def upsert_session(user_id: str, token: str, now_ms: int) -> Dict[str, Any]:
    session = {"id": str(uuid4()), "userId": user_id, "token": token, "createdAt": now_ms}
    conn = _get_conn()
    conn.execute(
        "insert into sessions (id,userId,token,createdAt) values (:id,:userId,:token,:createdAt)",
        session,
    )
    conn.commit()
    conn.close()
    return session


def get_session_by_token(token: str) -> Optional[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.execute("select * from sessions where token = ?", (token,))
    row = cur.fetchone()
    conn.close()
    return _row_to_dict(row) if row else None


def store_message(sender_id: str, recipient_id: str, ciphertext: str, nonce: str, now_ms: int) -> Dict[str, Any]:
    message = {
        "id": str(uuid4()),
        "senderId": sender_id,
        "recipientId": recipient_id,
        "ciphertext": ciphertext,
        "nonce": nonce,
        "createdAt": now_ms,
    }
    conn = _get_conn()
    conn.execute(
        "insert into messages (id,senderId,recipientId,ciphertext,nonce,createdAt) values (:id,:senderId,:recipientId,:ciphertext,:nonce,:createdAt)",
        message,
    )
    conn.commit()
    conn.close()
    return message


def list_messages(user_a: str, user_b: str) -> List[Dict[str, Any]]:
    conn = _get_conn()
    cur = conn.execute(
        (
            "select * from messages where (senderId = ? and recipientId = ?) or (senderId = ? and recipientId = ?) order by createdAt asc"
        ),
        (user_a, user_b, user_b, user_a),
    )
    rows = [_row_to_dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

