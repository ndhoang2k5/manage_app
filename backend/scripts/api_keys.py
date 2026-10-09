#!/usr/bin/env python3
"""Quản lý khóa API chỉ đọc cho tích hợp ngoài.

Chạy trong container backend:
  docker exec fashion_backend python scripts/api_keys.py list
  docker exec fashion_backend python scripts/api_keys.py create "Unbee Google Sheets" --brand 1
  docker exec fashion_backend python scripts/api_keys.py revoke 3
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from drivers.db_client import SessionLocal  # noqa: E402
from services.apiKeyService import ApiKeyService  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    create = sub.add_parser("create")
    create.add_argument("name")
    create.add_argument("--brand", type=int, action="append", help="brand_id được xem (lặp lại cho nhiều nhãn); bỏ trống = mọi nhãn")
    revoke = sub.add_parser("revoke")
    revoke.add_argument("key_id", type=int)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        service = ApiKeyService(db)
        if args.cmd == "list":
            for k in service.list_keys():
                state = "active" if k["active"] else f"revoked {k['revoked_at']}"
                print(f"#{k['id']}  {k['key_prefix']}…  {k['name']}  brands={k['brand_ids'] or 'all'}  "
                      f"last_used={k['last_used_at']}  {state}")
        elif args.cmd == "create":
            result = service.create_key(args.name, args.brand)
            print(f"Đã tạo khóa #{result['id']} ({result['name']}, brands={result['brand_ids'] or 'all'})")
            print(result["api_key"])
            print(result["message"])
        elif args.cmd == "revoke":
            print(service.revoke_key(args.key_id)["message"])
    finally:
        db.close()


if __name__ == "__main__":
    main()
