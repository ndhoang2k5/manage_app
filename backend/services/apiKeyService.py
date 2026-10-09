import hashlib
import secrets
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

KEY_PREFIX = "gmk_"


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _parse_brand_ids(csv: Optional[str]) -> Optional[List[int]]:
    if csv is None or str(csv).strip() == "":
        return None
    return [int(x) for x in str(csv).split(",") if str(x).strip()]


class ApiKeyService:
    """Khóa API chỉ đọc cho tích hợp bên ngoài (Google Sheets của Unbee...)."""

    def __init__(self, db: Session):
        self.db = db

    def create_key(self, name: str, brand_ids: Optional[List[int]] = None, created_by: Optional[int] = None):
        name = str(name or "").strip()
        if not name:
            raise Exception("Tên khóa không được để trống")
        if brand_ids:
            found = self.db.execute(
                text(f"SELECT id FROM brands WHERE id IN ({','.join(str(int(b)) for b in brand_ids)})")
            ).fetchall()
            missing = set(int(b) for b in brand_ids) - set(int(r[0]) for r in found)
            if missing:
                raise Exception(f"Không tìm thấy nhãn hàng: {sorted(missing)}")

        raw_key = KEY_PREFIX + secrets.token_urlsafe(32)
        brand_csv = ",".join(str(int(b)) for b in sorted(set(brand_ids))) if brand_ids else None
        self.db.execute(text("""
            INSERT INTO integration_api_keys (name, key_prefix, key_hash, brand_ids, created_by)
            VALUES (:name, :prefix, :hash, :brands, :uid)
        """), {
            "name": name,
            "prefix": raw_key[:12],
            "hash": hash_api_key(raw_key),
            "brands": brand_csv,
            "uid": created_by,
        })
        key_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        self.db.commit()
        return {
            "id": int(key_id),
            "name": name,
            "brand_ids": _parse_brand_ids(brand_csv),
            "api_key": raw_key,
            "message": "Lưu khóa này ngay, hệ thống không hiển thị lại.",
        }

    def list_keys(self):
        rows = self.db.execute(text("""
            SELECT id, name, key_prefix, brand_ids, created_by, created_at, last_used_at, revoked_at
            FROM integration_api_keys
            ORDER BY id DESC
        """)).fetchall()
        return [
            {
                "id": int(r[0]),
                "name": r[1],
                "key_prefix": r[2],
                "brand_ids": _parse_brand_ids(r[3]),
                "created_by": r[4],
                "created_at": r[5],
                "last_used_at": r[6],
                "revoked_at": r[7],
                "active": r[7] is None,
            }
            for r in rows
        ]

    def revoke_key(self, key_id: int):
        result = self.db.execute(
            text("UPDATE integration_api_keys SET revoked_at = NOW() WHERE id = :id AND revoked_at IS NULL"),
            {"id": int(key_id)},
        )
        self.db.commit()
        if result.rowcount == 0:
            raise Exception("Không tìm thấy khóa đang hoạt động với id này")
        return {"status": "success", "message": f"Đã thu hồi khóa #{key_id}"}

    def verify_key(self, raw_key: str):
        """Trả về {id, name, brand_ids} nếu khóa hợp lệ và chưa bị thu hồi, ngược lại None."""
        raw_key = str(raw_key or "").strip()
        if not raw_key.startswith(KEY_PREFIX):
            return None
        row = self.db.execute(text("""
            SELECT id, name, brand_ids
            FROM integration_api_keys
            WHERE key_hash = :hash AND revoked_at IS NULL
        """), {"hash": hash_api_key(raw_key)}).fetchone()
        if not row:
            return None
        self.db.execute(
            text("UPDATE integration_api_keys SET last_used_at = NOW() WHERE id = :id"),
            {"id": int(row[0])},
        )
        self.db.commit()
        return {"id": int(row[0]), "name": row[1], "brand_ids": _parse_brand_ids(row[2])}
