def humanize_error(exc: Exception) -> str:
    raw = str(exc or "").strip()
    lower = raw.lower()

    if not raw:
        return "Tên lỗi: Lỗi hệ thống. Vui lòng thử lại."

    # Keep already-humanized business errors as-is
    friendly_prefixes = (
        "lỗi:",
        "không ",
        "cần ",
        "mã ",
        "đơn ",
        "kho ",
        "thiếu ",
        "đã ",
    )
    if lower.startswith(friendly_prefixes) and "sql" not in lower and "mysql" not in lower:
        return raw

    if "data too long for column 'size_label'" in lower:
        return "Tên lỗi: Dữ liệu SKU SP quá dài. Vui lòng rút ngắn SKU SP hoặc Tên."
    if "data too long for column 'code'" in lower:
        return "Tên lỗi: Mã lệnh vượt quá độ dài cho phép."
    if "data too long for column" in lower:
        return "Tên lỗi: Dữ liệu nhập quá dài so với cấu trúc hệ thống."
    if "duplicate entry" in lower or "already exists" in lower:
        return "Tên lỗi: Dữ liệu bị trùng. Vui lòng kiểm tra lại mã đã nhập."
    if "integrityerror" in lower or "foreign key constraint fails" in lower:
        return "Tên lỗi: Dữ liệu liên kết không hợp lệ."

    technical_markers = (
        "mysql.connector.errors",
        "sql:",
        "sqlalchemy",
        "traceback",
        "background on this error",
        "parameters:",
        "pymysql",
    )
    if any(marker in lower for marker in technical_markers):
        return "Tên lỗi: Lỗi xử lý dữ liệu. Vui lòng kiểm tra lại thông tin nhập."

    return raw
