from sqlalchemy.orm import Session
from sqlalchemy import text
from entities.account import AccountCreateRequest, AccountUpdateRequest
from security import get_password_hash


class AccountService:
    def __init__(self, db: Session):
        self.db = db
        self._ensure_permission_tables()

    def _ensure_permission_tables(self):
        self.db.execute(text("""
            CREATE TABLE IF NOT EXISTS account_module_permissions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                module_key VARCHAR(50) NOT NULL,
                can_view BOOLEAN DEFAULT TRUE,
                can_manage BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE(user_id, module_key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """))
        self.db.commit()

    def _save_module_permissions(self, user_id: int, module_permissions: list):
        self.db.execute(
            text("DELETE FROM account_module_permissions WHERE user_id = :uid"),
            {"uid": user_id},
        )
        if not module_permissions:
            return

        query = text("""
            INSERT INTO account_module_permissions (user_id, module_key, can_view, can_manage)
            VALUES (:uid, :module_key, :can_view, :can_manage)
        """)
        for perm in module_permissions:
            self.db.execute(query, {
                "uid": user_id,
                "module_key": perm.module_key,
                "can_view": bool(perm.can_view),
                "can_manage": bool(perm.can_manage),
            })

    def _save_warehouse_scopes(self, user_id: int, warehouse_ids: list):
        self.db.execute(
            text("DELETE FROM user_permissions WHERE user_id = :uid"),
            {"uid": user_id},
        )
        if not warehouse_ids:
            return
        query = text("""
            INSERT INTO user_permissions (user_id, warehouse_id)
            VALUES (:uid, :wid)
        """)
        for wid in warehouse_ids:
            self.db.execute(query, {"uid": user_id, "wid": wid})

    def list_accounts(self):
        rows = self.db.execute(text("""
            SELECT u.id, u.username, u.full_name, u.role, u.created_at
            FROM users u
            ORDER BY u.id DESC
        """)).fetchall()

        result = []
        for row in rows:
            wh_rows = self.db.execute(
                text("SELECT warehouse_id FROM user_permissions WHERE user_id = :uid"),
                {"uid": row[0]},
            ).fetchall()
            warehouses = [r[0] for r in wh_rows]

            module_rows = self.db.execute(text("""
                SELECT module_key, can_view, can_manage
                FROM account_module_permissions
                WHERE user_id = :uid
                ORDER BY module_key ASC
            """), {"uid": row[0]}).fetchall()
            modules = [
                {
                    "module_key": m[0],
                    "can_view": bool(m[1]),
                    "can_manage": bool(m[2]),
                }
                for m in module_rows
            ]

            result.append({
                "id": row[0],
                "username": row[1],
                "full_name": row[2],
                "role": row[3],
                "created_at": row[4],
                "warehouse_ids": warehouses,
                "module_permissions": modules,
            })
        return result

    def create_account(self, req: AccountCreateRequest):
        try:
            existed = self.db.execute(
                text("SELECT id FROM users WHERE username = :u"),
                {"u": req.username},
            ).fetchone()
            if existed:
                raise Exception("Username đã tồn tại")

            self.db.execute(text("""
                INSERT INTO users (username, password, full_name, role)
                VALUES (:u, :p, :n, :r)
            """), {
                "u": req.username,
                "p": get_password_hash(req.password),
                "n": req.full_name,
                "r": req.role,
            })
            user_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            self._save_warehouse_scopes(user_id, req.warehouse_ids or [])
            self._save_module_permissions(user_id, req.module_permissions or [])
            self.db.commit()
            return {"status": "success", "message": "Tạo tài khoản thành công", "user_id": user_id}
        except Exception as e:
            self.db.rollback()
            raise e

    def update_account(self, account_id: int, req: AccountUpdateRequest):
        try:
            existed = self.db.execute(
                text("SELECT id, role FROM users WHERE id = :id"),
                {"id": account_id},
            ).fetchone()
            if not existed:
                raise Exception("Không tìm thấy tài khoản")

            fields = []
            params = {"id": account_id}
            if req.full_name is not None:
                fields.append("full_name = :full_name")
                params["full_name"] = req.full_name
            if req.role is not None:
                fields.append("role = :role")
                params["role"] = req.role
            if req.password:
                fields.append("password = :password")
                params["password"] = get_password_hash(req.password)

            if fields:
                self.db.execute(
                    text(f"UPDATE users SET {', '.join(fields)} WHERE id = :id"),
                    params,
                )

            if req.warehouse_ids is not None:
                self._save_warehouse_scopes(account_id, req.warehouse_ids)
            if req.module_permissions is not None:
                self._save_module_permissions(account_id, req.module_permissions)

            self.db.commit()
            return {"status": "success", "message": "Cập nhật tài khoản thành công"}
        except Exception as e:
            self.db.rollback()
            raise e

    def delete_account(self, account_id: int, current_user_id: int):
        try:
            if account_id == current_user_id:
                raise Exception("Không thể tự xóa tài khoản đang đăng nhập")

            user = self.db.execute(
                text("SELECT id, role FROM users WHERE id = :id"),
                {"id": account_id},
            ).fetchone()
            if not user:
                raise Exception("Không tìm thấy tài khoản")

            if user[1] == "admin":
                admin_count = self.db.execute(
                    text("SELECT COUNT(*) FROM users WHERE role = 'admin'")
                ).scalar()
                if admin_count <= 1:
                    raise Exception("Không thể xóa admin cuối cùng của hệ thống")

            self.db.execute(text("DELETE FROM users WHERE id = :id"), {"id": account_id})
            self.db.commit()
            return {"status": "success", "message": "Đã xóa tài khoản"}
        except Exception as e:
            self.db.rollback()
            raise e

    def get_account_permissions(self, account_id: int):
        user = self.db.execute(
            text("SELECT id, username, full_name, role FROM users WHERE id = :id"),
            {"id": account_id},
        ).fetchone()
        if not user:
            raise Exception("Không tìm thấy tài khoản")

        warehouses = self.db.execute(
            text("SELECT warehouse_id FROM user_permissions WHERE user_id = :id ORDER BY warehouse_id"),
            {"id": account_id},
        ).fetchall()
        modules = self.db.execute(text("""
            SELECT module_key, can_view, can_manage
            FROM account_module_permissions
            WHERE user_id = :id
            ORDER BY module_key
        """), {"id": account_id}).fetchall()

        return {
            "id": user[0],
            "username": user[1],
            "full_name": user[2],
            "role": user[3],
            "warehouse_ids": [w[0] for w in warehouses],
            "module_permissions": [
                {"module_key": m[0], "can_view": bool(m[1]), "can_manage": bool(m[2])}
                for m in modules
            ],
        }

    def update_module_permissions(self, account_id: int, module_permissions: list):
        try:
            self._save_module_permissions(account_id, module_permissions)
            self.db.commit()
            return {"status": "success", "message": "Đã cập nhật quyền module"}
        except Exception as e:
            self.db.rollback()
            raise e

    def update_scope_permissions(self, account_id: int, warehouse_ids: list):
        try:
            self._save_warehouse_scopes(account_id, warehouse_ids)
            self.db.commit()
            return {"status": "success", "message": "Đã cập nhật phạm vi kho/xưởng"}
        except Exception as e:
            self.db.rollback()
            raise e
