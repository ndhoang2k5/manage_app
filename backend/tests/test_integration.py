import unittest
from datetime import datetime

from services.integrationService import (
    MOVE_ISSUE,
    MOVE_RETURN,
    MOVE_TRANSFER,
    ORDER_CANCELLED,
    ORDER_CLOSED,
    ORDER_NOT_CUT,
    ORDER_RECEIVED,
    ORDER_SEWING,
    classify_transfer,
    order_line_status,
    pair_transfers,
    parse_cancelled_code,
    parse_item_label,
    split_size_color,
    transfer_tag,
)


class ParseItemLabelTests(unittest.TestCase):
    def test_sku_label(self):
        self.assertEqual(parse_item_label("SKU:QA38801||TEN:be 6-9m"), ("QA38801", "be 6-9m"))

    def test_sku_label_without_name_falls_back_to_note(self):
        self.assertEqual(parse_item_label("SKU:QA38801", "hồng 3-6m"), ("QA38801", "hồng 3-6m"))

    def test_plain_size(self):
        self.assertEqual(parse_item_label("XL"), (None, "XL"))
        self.assertEqual(parse_item_label(None), (None, ""))


class SplitSizeColorTests(unittest.TestCase):
    def test_splits_trailing_size(self):
        self.assertEqual(split_size_color("be 6-9m"), ("6-9m", "be"))
        self.assertEqual(split_size_color("cánh cụt 3-6m"), ("3-6m", "cánh cụt"))
        self.assertEqual(split_size_color("cappy sz 0-3m"), ("0-3m", "cappy"))
        self.assertEqual(split_size_color("hồng 9-12m"), ("9-12m", "hồng"))
        self.assertEqual(split_size_color("Xanh - XL"), ("XL", "Xanh"))
        self.assertEqual(split_size_color("Đỏ S"), ("S", "Đỏ"))

    def test_name_without_size_is_color_only(self):
        self.assertEqual(split_size_color("Lody"), (None, "Lody"))
        self.assertEqual(split_size_color("Kem"), (None, "Kem"))
        self.assertEqual(split_size_color("Cappy"), (None, "Cappy"))

    def test_size_only_and_empty(self):
        self.assertEqual(split_size_color("3-6m"), ("3-6m", None))
        self.assertEqual(split_size_color("M"), ("M", None))
        self.assertEqual(split_size_color(""), (None, None))
        self.assertEqual(split_size_color(None), (None, None))


class OrderHelpersTests(unittest.TestCase):
    def test_parse_cancelled_code(self):
        code, at = parse_cancelled_code("HĐ26ub59 cắt ngày 08.10_C_1759900000")
        self.assertEqual(code, "HĐ26ub59 cắt ngày 08.10")
        self.assertIsInstance(at, datetime)
        self.assertIsNone(at.tzinfo)
        self.assertEqual(parse_cancelled_code("HĐ26ub59"), ("HĐ26ub59", None))

    def test_order_line_status(self):
        self.assertEqual(order_line_status("draft", 100, 0), ORDER_NOT_CUT)
        self.assertEqual(order_line_status("waiting_material", 100, 0), ORDER_NOT_CUT)
        self.assertEqual(order_line_status("in_progress", 100, 40), ORDER_SEWING)
        self.assertEqual(order_line_status("in_progress", 100, 100), ORDER_RECEIVED)
        self.assertEqual(order_line_status("completed", 100, 90), ORDER_CLOSED)
        self.assertEqual(order_line_status("cancelled", 100, 0), ORDER_CANCELLED)


def _t(id_, type_, wid, qty, tag=None, material_id=7):
    return {"id": id_, "type": type_, "warehouse_id": wid, "material_id": material_id,
            "qty": qty, "tag": tag, "created_at": datetime(2026, 10, 9, 8, 0, id_ % 60)}


class TransferTests(unittest.TestCase):
    def test_transfer_tag(self):
        self.assertEqual(transfer_tag("[TRF:AUTO:540:1759650000] Tự động"), "AUTO:540:1759650000")
        self.assertIsNone(transfer_tag("Sửa phiếu nhập"))
        self.assertIsNone(transfer_tag(None))

    def test_pairs_out_with_next_matching_in(self):
        rows = [
            _t(1, "transfer_out", 1, -50, "AUTO:9:1"),
            _t(2, "transfer_in", 2, 50, "AUTO:9:1"),
            # Hai phiếu cũ không thẻ, cùng vật tư, cùng lượng: phải ghép theo thứ tự.
            _t(10, "transfer_out", 1, -20),
            _t(11, "transfer_in", 3, 20),
            _t(12, "transfer_out", 3, -20),
            _t(13, "transfer_in", 1, 20),
            _t(20, "transfer_in", 4, 5, "MANUAL:1:4:1"),
        ]
        pairs = {(o["id"] if o else None, i["id"] if i else None) for o, i in pair_transfers(rows)}
        self.assertEqual(pairs, {(1, 2), (10, 11), (12, 13), (None, 20)})

    def test_classify_transfer(self):
        self.assertEqual(classify_transfer(True, False), MOVE_ISSUE)
        self.assertEqual(classify_transfer(False, True), MOVE_RETURN)
        self.assertEqual(classify_transfer(False, False), MOVE_TRANSFER)
        self.assertEqual(classify_transfer(True, None), MOVE_TRANSFER)


if __name__ == "__main__":
    unittest.main()
