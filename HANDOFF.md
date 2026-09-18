# Tài liệu bàn giao hệ thống Fashion WMS

> Cập nhật theo mã nguồn tại workspace ngày 23/08/2026. Đây là tài liệu mô tả **trạng thái đang được triển khai trong code**, không chỉ dựa trên các file yêu cầu cũ `text`, `text1`, `text2`.

## 1. Tổng quan

Fashion WMS là hệ thống quản lý chuỗi cung ứng thời trang, bao phủ các nhóm nghiệp vụ:

- danh mục nguyên vật liệu, biến thể/màu và nhóm vật tư;
- nhãn hàng, kho tổng, xưởng và quan hệ kho tổng quản lý xưởng;
- nhập mua và cập nhật tồn kho;
- điều chuyển tồn giữa kho/xưởng;
- BOM, lệnh sản xuất, giữ/cấp nguyên liệu, tiến độ và nhận thành phẩm;
- dashboard tồn kho/sản xuất và xuất Excel;
- đơn hàng dự kiến;
- lấy số bán và tồn hiện tại từ Salework cho ba nhãn `unbee`, `himomi`, `ranbee`;
- đánh dấu mã bán ưu tiên, báo cáo bán hàng và kế hoạch đặt vải 4 tuần;
- kiểm tồn đối chiếu Salework với sổ kế toán (được bật/tắt bằng feature flag);
- đăng nhập, phân quyền theo module, kho/xưởng và nhãn được xem giá vốn.

Luồng tổng quát:

```text
Trình duyệt
  -> Nginx HTTPS
     -> React SPA (giao diện)
     -> /api, /static -> FastAPI
                         -> Service nghiệp vụ
                         -> MySQL
                         -> Salework Open API (số bán/tồn)

FastAPI startup
  -> background thread (nếu bật)
  -> định kỳ đồng bộ số bán + tồn Salework của 3 nhãn vào MySQL
```

## 2. Kiến trúc kỹ thuật

| Lớp | Công nghệ | Vai trò |
|---|---|---|
| Frontend | React 18, Vite, Ant Design, Axios, React Router, SheetJS | SPA, form nghiệp vụ, bảng báo cáo, import/export phía trình duyệt |
| API | FastAPI, Pydantic | Nhận request, xác thực/phân quyền, validate dữ liệu, trả JSON/Excel/ảnh |
| Service | Python + SQLAlchemy Core (`text`) | Chứa quy tắc nghiệp vụ và transaction |
| Database | MySQL 8, UTF-8 MB4 | Dữ liệu danh mục, tồn, chứng từ, phân quyền, snapshot bán hàng |
| Tích hợp | Salework Open Stock API | Lấy danh sách sản phẩm/tồn và báo cáo bán theo thời gian |
| Reverse proxy | Nginx | HTTPS, route SPA, proxy `/api` và `/static` |
| Triển khai | Docker Compose | MySQL, backend, frontend, Nginx, Certbot |

Backend không dùng ORM model khai báo quan hệ; phần lớn truy vấn là SQL viết tay. Các file `backend/entities/` là Pydantic request/response schema, không phải model DB. Vì vậy thay đổi schema phải được kiểm tra trực tiếp với mọi câu SQL có liên quan.

### Cấu trúc thư mục quan trọng

```text
backend/
  api/          route FastAPI, auth/scope và chuyển lỗi HTTP
  services/     nghiệp vụ và truy vấn DB
  entities/     Pydantic schema
  drivers/      kết nối DB, dependency auth/permission
  jobs/         worker đồng bộ Salework
  static/       ảnh được backend phục vụ
frontend/src/
  pages/        màn hình theo module
  api/          axios client theo domain
  utils/        kiểm tra quyền phía UI
database/data/  các migration SQL rời theo ngày
nginx/conf.d/   reverse proxy HTTPS ngoài cùng
saleworkTest/   dữ liệu thử nghiệm/raw/processed cũ
```

## 3. Luồng request và xác thực

1. Người dùng đăng nhập tại `POST /api/v1/auth/login` bằng OAuth2 form (`username`, `password`).
2. Backend tìm user trong MySQL, kiểm tra bcrypt. Mật khẩu plain text cũ vẫn được chấp nhận một lần và tự đổi sang hash.
3. Backend trả JWT bearer và `user_info`, gồm role, danh sách kho, quyền module và các brand được xem giá vốn.
4. Frontend lưu `token` và `user` trong `localStorage`; Axios gửi bearer token cho các API sau.
5. FastAPI giải mã JWT tại `get_current_user`; route nhạy cảm dùng `require_module_access(...)`, `require_admin` và các hàm kiểm tra scope resource.

JWT hiện chứa `sub`, `id`, `role`, `wid` và hết hạn sau 30 ngày. Quyền module/scope được đọc lại từ DB khi API kiểm tra, nên thay đổi quyền có hiệu lực phía backend mà không cần chờ JWT hết hạn. Tuy nhiên menu frontend dựa trên `user_info` trong `localStorage`, vì vậy người dùng nên đăng nhập lại để giao diện phản ánh quyền mới.

### Mô hình phân quyền

- `admin`: toàn quyền và bỏ qua scope.
- `inventory`, `warehouses`: user đăng nhập được xem mặc định.
- Module khác: `account_module_permissions.can_view/can_manage`.
- Scope kho trực tiếp: `user_permissions`.
- Nếu được cấp kho tổng, scope được mở rộng sang xưởng trong `central_workshop_links`.
- Lệnh sản xuất kiểm tra cả xưởng thực hiện (`warehouse_id`) và kho tổng/nhãn sở hữu (`owner_central_id`).
- Giá vốn là quyền riêng: cần module `material-cost` và brand nằm trong `account_material_cost_brand_permissions`.
- Chỉ admin được vào quản lý tài khoản.

Frontend ẩn menu và redirect route để cải thiện UX; đây không phải lớp bảo mật chính. Backend mới là nơi bắt buộc phải enforce quyền.

## 4. Các khối dữ liệu chính

### Danh mục và tổ chức kho

- `brands`: nhãn hàng.
- `warehouses`: kho tổng hoặc xưởng (`is_central`), thuộc một brand.
- `central_workshop_links`: quan hệ nhiều-nhiều giữa kho tổng và xưởng; cho phép phối hợp khác brand.
- `products`: sản phẩm/vật tư cha.
- `product_variants`: SKU/biến thể/màu, giá vốn và thuộc tính.
- `material_groups`, `material_group_details`: bộ/nhóm vật tư và định mức thành phần.

### Tồn kho và chứng từ

- `inventory_stocks`: số tồn hiện tại theo `(warehouse_id, product_variant_id)`; đây là bảng đọc nhanh số dư.
- `inventory_transactions`: nhật ký tăng/giảm/chuyển kho và reference về chứng từ.
- `suppliers`, `purchase_orders`, `purchase_order_items`: nhà cung cấp và phiếu nhập.
- `bom`, `bom_materials`: công thức sản xuất.
- `production_orders`, `production_order_items`: lệnh và cơ cấu size/số lượng.
- `production_material_reservations`: lượng nguyên liệu dự kiến/đã giữ cho lệnh.
- `production_receive_logs`: từng lần nhận thành phẩm.
- `production_order_snapshots`: snapshot/audit thay đổi lệnh.
- `production_order_images`: ảnh của lệnh.

### Bán hàng Salework

- `sales_report_runs`: từng cửa sổ thời gian đã lấy, brand và raw payload.
- `sales_report_items`: số lượng/doanh thu đã chuẩn hóa theo mã trong mỗi run.
- `sales_product_stock_current`: snapshot tồn/giá/barcode mới nhất theo brand và mã.
- `sales_priority_codes`: danh sách mã ưu tiên để đánh dấu/lọc.

### Kiểm tồn kế toán

- `inventory_check_periods`: kỳ kiểm tồn.
- `accounting_stock_openings`/`accounting_stock_openings_v2`: tồn đầu kỳ.
- `accounting_stock_movements`: tăng/giảm kế toán theo mã và chứng từ.
- `inventory_check_bootstrap_state`: trạng thái khởi tạo.
- `inventory_check_sales_sync_state`/`_v2`: con trỏ lần đồng bộ số bán gần nhất.

### Người dùng

- `users`: tài khoản, password hash, role và cột kho cũ.
- `user_permissions`: scope nhiều kho.
- `account_module_permissions`: quyền xem/quản lý module.
- `account_material_cost_brand_permissions`: brand được xem giá vốn.

## 5. Quy trình nghiệp vụ

### 5.1 Tạo vật tư

1. Tạo/tái sử dụng record cha trong `products` theo tên.
2. Tạo một hoặc nhiều `product_variants` theo SKU/màu.
3. Khi đọc danh sách, tồn được tổng hợp từ `inventory_stocks`; giá vốn chỉ trả cho user có quyền brand phù hợp ở các luồng áp dụng kiểm soát giá.
4. Chỉ cho xóa biến thể khi không còn tồn và không bị tham chiếu bởi BOM, nhập mua, giao dịch/điều chỉnh/bán hàng.

`material_scope` phân biệt phạm vi vật tư (code chuẩn hóa tại service, mặc định `retail`). Nhóm vật tư lưu định mức chuẩn cho nhiều vật tư thành phần.

### 5.2 Nhập hàng

Tạo phiếu:

1. Chọn nhà cung cấp cũ hoặc tạo nhanh nhà cung cấp mới.
2. Tạo `purchase_orders` trạng thái `completed` và các item.
3. Với từng item, tính lại giá vốn bình quân gia quyền dựa trên tổng tồn hiện có và giá nhập mới.
4. Upsert tăng `inventory_stocks` tại kho nhận.
5. Ghi `inventory_transactions` loại `purchase_in`.
6. Commit toàn bộ; lỗi ở bất kỳ bước nào sẽ rollback.

Sửa phiếu cập nhật tồn theo chênh lệch số lượng, thêm transaction ghi chú sửa/thêm và tính lại giá vốn từ toàn bộ lịch sử item mua. Xóa dòng hoặc xóa phiếu sẽ kiểm tra kho còn đủ để hoàn tác; nếu hàng đã được dùng/xuất khiến tồn thấp hơn lượng cần trừ thì từ chối xóa.

### 5.3 Điều chuyển kho/xưởng

1. Kiểm tra kho nguồn khác kho đích và scope người dùng.
2. Lock/đọc tồn nguồn, từ chối nếu không đủ.
3. Trừ nguồn, ghi transaction `transfer_out`.
4. Upsert cộng kho đích, ghi transaction `transfer_in`.
5. Commit cùng transaction DB.

Lịch sử chuyển được dựng từ `inventory_transactions`. Xóa kho chỉ được phép khi không còn tồn và không có chứng từ nhập/lệnh sản xuất tham chiếu.

### 5.4 Sản xuất

Có hai cách tạo:

- tạo lệnh thường từ sản phẩm/BOM có sẵn;
- tạo nhanh đồng thời sản phẩm, biến thể, BOM, lệnh, cơ cấu size, phí, ảnh và tùy chọn tự bắt đầu.

Vòng đời chính:

```text
draft
  -> start: kiểm tra/giữ hoặc xuất nguyên liệu theo reservation
  -> in_progress
  -> receive: nhận thành phẩm từng size, cộng tồn và ghi receive log
  -> completed/finished khi đã nhận đủ hoặc force-finish
```

Các nguyên tắc cần giữ khi sửa code:

- lượng nguyên liệu dùng được tính theo BOM và số lượng kế hoạch, dùng Decimal/làm tròn để hạn chế sai số;
- reservation là nguồn để biết nhu cầu, lượng đã cấp và phần còn lại;
- nhận hàng có thể thực hiện nhiều lần theo size, không mặc định một lần là hoàn tất;
- mỗi lần nhận tạo log để có thể hoàn tác; xóa log phải trừ lại lượng thành phẩm tương ứng;
- sửa/xóa lệnh phải hoàn tác đúng tồn/reservation/log theo trạng thái hiện tại;
- snapshot được ghi cho các sự kiện quan trọng và có snapshot thủ công;
- API luôn kiểm tra scope theo chính order ID, không chỉ lọc danh sách.

Các màn hình liên quan gồm tạo sản xuất, tiến trình, quản lý đơn, chi tiết/in/xuất Excel và dashboard xưởng.

### 5.5 Báo cáo kho

- Dashboard kho tổng lấy kho tổng và các xưởng liên kết, tổng hợp tồn/giá trị/sản xuất theo phạm vi được phép.
- Chi tiết xưởng trả thông tin xưởng, tồn, lệnh sản xuất và tổng giá trị tài sản.
- Báo cáo tồn có thể xuất Excel.
- Giá trị tồn phụ thuộc `product_variants.cost_price`; cần tiếp tục bảo vệ theo quyền giá vốn khi mở rộng endpoint.

### 5.6 Đơn hàng dự kiến

CRUD `draft_orders` cùng danh sách ảnh `draft_order_images`. Đây là kế hoạch/ý tưởng đơn hàng, tách khỏi lệnh sản xuất thật; khi phát triển luồng chuyển đổi sang sản xuất cần tạo transaction rõ ràng thay vì sửa trực tiếp draft.

## 6. Luồng lấy và xử lý dữ liệu Salework

Hệ thống gọi hai endpoint bên ngoài:

| Mục đích | Method/endpoint | Dữ liệu dùng |
|---|---|---|
| Tồn hiện tại | `GET /api/open/stock/v1/product/list` | product code/name, stock theo kho, cost, retail price, barcode |
| Bán theo thời gian | `POST /api/open/stock/v1/report/product` | `time_start`, `time_end` dạng Unix milliseconds; số lượng/doanh thu/kênh/shop |

Credential lấy từ biến môi trường theo brand: `SALEWORK_<BRAND>_CLIENT_ID` và `SALEWORK_<BRAND>_TOKEN`. `unbee` có fallback về biến chung. Không ghi token thật vào tài liệu, log hoặc commit mới.

### 6.1 Đồng bộ số bán

1. Client/worker chọn brand và cửa sổ `[time_start, time_end]`.
2. Service từ chối khoảng không hợp lệ hoặc dài hơn giới hạn (mặc định 24 giờ) để tránh run chồng nhau gây cộng trùng.
3. Nếu DB đã có đúng run hoặc một run bao phủ khoảng đó và không ép refresh, tái sử dụng dữ liệu.
4. Gọi Salework với timeout/retry cấu hình qua env.
5. `aggregate_sales_report` chuẩn hóa các shape lồng nhau, loại nested run trùng, gom theo mã: tên, số bán, doanh thu, kênh và số shop.
6. Lưu raw response vào `sales_report_runs`, dòng tổng hợp vào `sales_report_items`.
7. Khi run mới bao phủ hoàn toàn run cũ, run cũ được xóa để tránh double count.
8. API report tổng hợp các run phù hợp, join tồn hiện tại và priority code, rồi lọc/tìm/sort/phân trang/top N.

Backfill chia lịch sử thành chunk (mặc định sử dụng chunk 24 giờ từ request) và lưu con trỏ `next_cursor`. Đồng bộ tức thời bắt đầu từ `MAX(time_end)` đã có; lần đầu lấy từ `SALEWORK_SYNC_START_MS` hoặc tối đa một cửa sổ gần nhất.

### 6.2 Đồng bộ tồn sản phẩm

1. Gọi `product/list`.
2. Chuẩn hóa `products` thành một dòng mỗi code.
3. Cộng `stocks[].value` thành `total_stock`, giữ chi tiết tồn kho dưới JSON.
4. Upsert `sales_product_stock_current` theo `(brand_key, code)` và ghi thời điểm sync.

Đây là tồn của Salework phục vụ báo cáo bán; không phải `inventory_stocks` nội bộ của WMS. Không được đồng nhất hoặc ghi chéo hai bảng nếu chưa có quy tắc đối soát được duyệt.

### 6.3 Worker tự động

Khi `SALEWORK_AUTO_SYNC_ENABLED=true`, startup FastAPI tạo một daemon thread. Mỗi chu kỳ (mặc định từ env, tối thiểu 30 giây), worker lần lượt sync `unbee`, `himomi`, `ranbee`, mỗi brand dùng DB session riêng. Lỗi một brand được log và không dừng vòng lặp.

Lưu ý: worker nằm trong process web. Nếu chạy nhiều Uvicorn worker/container backend, mỗi process có thể tạo một scheduler riêng và gọi API trùng. Production hiện nên giữ một backend worker hoặc tách scheduler thành service/job có distributed lock.

### 6.4 Mã ưu tiên và báo cáo

- Danh sách mã có thể `replace` hoặc `append` theo brand.
- `sales_product_catalog`: danh mục các mã **hiện có trên Salework** theo brand (bản sao của `sales_product_stock_current`); được rebuild ở mỗi lần sync tồn (mã không còn trong product list Salework bị xóa khỏi cả bảng tồn lẫn catalog) và tự seed lần đầu từ bảng tồn. Báo cáo và xuất Excel chỉ liệt kê catalog rồi LEFT JOIN số bán trong kỳ (bảng tạm `tmp_period_sales`) và tồn hiện tại, nên mã chưa bán trong kỳ hoặc đã hết tồn vẫn hiển thị, còn mã chỉ có trong đơn cũ (SP đã xóa/nhập tay, tên rỗng hoặc tên ghép) không hiển thị nữa.
- Báo cáo hỗ trợ keyword, chỉ mã ưu tiên, ngưỡng số lượng/doanh thu, sort (phía server, kể cả tồn kho), top N và phân trang. Khi sort theo SL bán/doanh số, mã không có số bán luôn nằm cuối dù chiều sort là gì.
- Export Excel chi tiết theo shop gồm mã, tên, số bán, doanh thu, tồn, kênh, shop và cờ ưu tiên.
- UI dùng cờ ưu tiên để đánh dấu các mã nằm trong danh sách đã tải/chọn.

### 6.5 Kế hoạch đặt vải 4 tuần

Module `fabric-planning` tìm code từ dữ liệu số bán đã lưu và tính bảng kế hoạch theo các tuần quanh `anchor_time_ms`. Luồng này dùng dữ liệu lịch sử trong `sales_report_*`, không gọi Salework trực tiếp mỗi lần xem. Vì vậy cần backfill/sync đủ các tuần trước khi tin vào kết quả.

## 7. Luồng kiểm tồn Salework - kế toán

Module chỉ được mount backend khi `INVENTORY_CHECK_ENABLED=true` và chỉ hiện frontend khi `VITE_INVENTORY_CHECK_ENABLED=true`.

1. Tạo/chọn kỳ kiểm tồn theo tháng.
2. Khởi tạo tồn đầu kỳ kế toán từ snapshot `product/list`; trạng thái bootstrap ngăn khởi tạo sai/lặp.
3. Cột Salework đọc tồn mới từ API; cột kế toán tính từ tồn đầu kỳ cộng các movement tăng/giảm.
4. Import file kế toán tạo movement có lý do/chứng từ/ghi chú.
5. Sync bán hàng gọi `report/product`, gom số bán theo mã và ghi movement `Xuất bán`.
6. Sync realtime dùng `last_sync_ms -> now`; lần đầu chỉ bootstrap 5 phút gần nhất, bỏ qua cửa sổ dưới 10 giây và upsert theo mã/ngày để hạn chế phình dữ liệu.
7. Summary so sánh hai bên; close kỳ chốt số và chuẩn bị kỳ kế tiếp theo logic API.

Module này có một pipeline riêng so với `sales-management`; cả hai cùng gọi Salework nhưng lưu mục đích khác nhau. Khi sửa parser/report nên kiểm thử cả hai để tránh kết quả lệch.

## 8. API theo module

Tất cả route dưới prefix `/api/v1`.

| Module | Nhóm endpoint chính |
|---|---|
| Auth | `/auth/login`, `/auth/me`, `/auth/register` |
| Tài khoản | `/accounts`, `/accounts/{id}/permissions/...` |
| Vật tư | `/materials`, `/materials/groups`, `/materials/warehouse/{id}` |
| Kho | `/brands`, `/warehouses`, `/warehouses/transfer`, history, central-links |
| Nhập hàng | `/suppliers`, `/purchases`, item delete |
| Sản xuất | `/production/boms`, `/production/orders`, start/receive/finish/progress/history/snapshot/reservation/export/print |
| Báo cáo | `/reports/central-dashboard/{id}`, `/reports/workshop/{id}`, export inventory |
| Dự kiến | `/drafts` CRUD |
| Số bán | `/sales-management/fetch`, report, sync, backfill, stock, priority, search, export |
| Kế hoạch vải | `/sales-management/product-planning/...` |
| Kiểm tồn | `/inventory-check/...` (feature flag) |

Swagger có tại `/docs` trên backend nội bộ.

## 9. Chạy và triển khai

### Docker Compose

Các service:

- `database`: MySQL 8, cổng host hiện map `3307 -> 3306`, volume `db_data`.
- `backend`: Uvicorn cổng nội bộ 8000, bind mount `./backend:/app`.
- `frontend`: build Vite rồi phục vụ bằng Nginx nội bộ.
- `nginx`: public 80/443 trên IP cấu hình, TLS cho `ranbeevn.com`.
- `certbot`: dùng chung volume challenge/chứng chỉ.

Lệnh thường dùng:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Migration trong `database/data/*.sql` hiện là các script rời, không có migration runner/version table rõ ràng. Trước deploy phải backup DB, xác định script nào đã chạy, chạy theo thứ tự ngày/phụ thuộc và kiểm tra schema sau mỗi bước.

### Phát triển frontend

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

### Kiểm thử backend

Repo có test tập trung tại `backend/tests/test_sales_management.py`. Cần bổ sung test cho inventory transaction, production rollback, permission resource scope và inventory check. Việc import backend hiện kết nối DB ngay với retry, nên test/unit tooling cần có DB hoặc refactor engine initialization để dễ cô lập.

## 10. Biến môi trường quan trọng

| Biến | Ý nghĩa |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Kết nối MySQL |
| `SALEWORK_<BRAND>_CLIENT_ID`, `SALEWORK_<BRAND>_TOKEN` | Credential theo nhãn |
| `SALEWORK_TIMEOUT_SECONDS`, `SALEWORK_RETRY_COUNT` | Timeout/retry API ngoài |
| `SALEWORK_MAX_REPORT_WINDOW_MS` | Cửa sổ report tối đa |
| `SALEWORK_SYNC_START_MS`, `SALEWORK_MIN_SYNC_WINDOW_MS` | Mốc bắt đầu/cửa sổ sync nhỏ nhất |
| `SALEWORK_AUTO_SYNC_ENABLED`, `SALEWORK_AUTO_SYNC_INTERVAL_SECONDS` | Worker tự động |
| `SALEWORK_CATALOG_REFRESH_ENABLED` (mặc định true), `SALEWORK_CATALOG_REFRESH_HOUR` (mặc định 5), `SALEWORK_CATALOG_REFRESH_MINUTE` | Job `jobs/sales_catalog_daily_refresh.py`: mỗi ngày 1 lần kéo product list Salework cho 3 brand, rebuild `sales_product_catalog` (thêm mã mới, xóa mã đã xóa trên Salework), log số thêm/xóa. Chạy độc lập với worker số bán nên catalog vẫn được cập nhật kể cả khi sync số bán lỗi. |
| `SALEWORK_AUTO_BOOTSTRAP_SCHEMA` | Cho service tự tạo bảng sales (chỉ hợp dev) |
| `INVENTORY_CHECK_ENABLED` | Mount API kiểm tồn backend |
| `VITE_INVENTORY_CHECK_ENABLED` | Hiện route/menu kiểm tồn frontend tại build time |

## 11. Rủi ro và nợ kỹ thuật cần ưu tiên

1. **Secret đang nằm trong source/config**: password DB, JWT secret và credential Salework hiện có giá trị thật trong file. Cần rotate toàn bộ, chuyển sang secret manager hoặc `.env` không commit và cung cấp `.env.example` chỉ có tên biến.
2. **Mount init DB không hợp lệ trong workspace**: Compose mount `./database/data/init.sql` như file nhưng đường dẫn hiện là thư mục rỗng. Máy mới có thể không khởi tạo được schema. Cần tạo một baseline SQL thực hoặc chuyển hoàn toàn sang migration tool.
3. **Migration chưa có bộ quản lý phiên bản**: nhiều script ngày tháng dễ chạy thiếu/chạy lặp. Nên dùng Alembic/Flyway hoặc bảng migration ledger.
4. **JWT secret hard-code và CORS có `*` cùng credentials**: phải chuyển secret sang env, giới hạn origin HTTPS thật và rà soát cấu hình CORS.
5. **Token 30 ngày, không có revoke/refresh rõ ràng**: xóa/khóa user không vô hiệu token cũ ngay vì `get_current_user` chỉ decode payload, không tải lại user. Nên kiểm tra trạng thái user mỗi request hoặc có token version/revocation.
6. **Scheduler trong web process**: scale backend sẽ tạo sync trùng. Cần tách worker và thêm lock/idempotency.
7. **Hai pipeline Salework**: sales management và inventory check có parser/con trỏ khác nhau; cần hợp nhất client/parser dùng chung và test fixture cho mọi response shape.
8. **SQL động**: một số `IN (...)` dựng từ ID đã ép int nhưng vẫn khó bảo trì. Nên chuẩn hóa bind parameter/expanding params.
9. **Transaction ledger chưa hoàn toàn immutable**: một số sửa/xóa dùng transaction âm cùng type cũ. Nên chuẩn hóa direction/event type và thêm unique/idempotency key.
10. **Giá vốn không được tính lại đồng nhất ở mọi thao tác**: tạo/sửa nhập có logic WAC khác nhau; xóa phiếu/dòng cần được kiểm tra kỹ việc recompute cost.
11. **Frontend giữ quyền cũ trong localStorage**: UI có thể lệch backend sau khi admin đổi quyền; nên refresh `/auth/me` khi mở app.
12. **Backend Docker chạy `--reload` trong production**: tăng rủi ro reload/process phụ và worker sync lặp. Production nên bỏ `--reload`.
13. **Ảnh nằm trong bind mount local**: chưa có object storage, backup và lifecycle rõ ràng.
14. **README gốc trống và `text*` chứa yêu cầu/credential cũ**: nên coi `HANDOFF.md` là điểm bắt đầu, sau đó xóa/ẩn secret khỏi lịch sử Git bằng quy trình rotate phù hợp.

## 12. Checklist bàn giao/vận hành

Trước khi deploy:

- backup MySQL và kiểm thử restore;
- đối chiếu schema với toàn bộ migration;
- xác nhận secret/env theo ba brand;
- chạy test sales management, lint/build frontend;
- test login admin/staff và 401/403;
- test scope kho tổng, xưởng liên kết chéo brand và order theo owner;
- test một vòng nhập -> sửa -> xóa và kiểm tra stock/transaction;
- test một vòng sản xuất -> start -> nhận nhiều lần -> hoàn tác log -> hoàn tất;
- chạy sync một cửa sổ nhỏ, kiểm tra không cộng trùng run;
- chỉ bật inventory check khi cả backend và frontend flag đồng bộ;
- xác nhận chỉ có một scheduler Salework hoạt động;
- kiểm tra healthcheck, HTTPS, `/api`, `/static` và SPA refresh.

Khi có sai lệch tồn:

1. Không sửa thẳng `inventory_stocks` trước khi xác định nguồn.
2. Lấy SKU + warehouse, đối chiếu `inventory_transactions`, purchase item, production reservation/receive log.
3. Xác định số dư đúng và chứng từ gây lệch.
4. Backup các row liên quan.
5. Sửa bằng migration/adjustment có audit note, rồi kiểm tra dashboard và báo cáo.

Khi số bán lệch:

1. Xác nhận brand, timezone Asia/Ho_Chi_Minh và milliseconds đầu/cuối kỳ.
2. Kiểm tra run có chồng/thiếu cửa sổ trong `sales_report_runs`.
3. So raw payload với `sales_report_items` và logic lọc nested run.
4. Kiểm tra tồn hiện tại có timestamp sync mới.
5. Backfill theo chunk nhỏ; không fetch một khoảng dài vượt giới hạn.

## 13. Điểm bắt đầu khi tiếp tục phát triển

- Route/UI: `frontend/src/App.jsx` và `backend/main.py`.
- Auth/scope: `backend/drivers/dependencies.py`, `backend/services/authService.py`.
- Tồn mua/chuyển: `purchaseService.py`, `warehouseService.py`.
- Sản xuất: `productionService.py` (file lớn, cần test hồi quy theo từng trạng thái).
- Salework: `salesManagementService.py`, `salesManagementUtils.py`, `jobs/sales_realtime_sync.py`.
- Kiểm tồn: `backend/api/inventory_check.py`.
- Hạ tầng: `docker-compose.yml`, `nginx/conf.d/default.conf`.

Nguyên tắc quan trọng nhất khi sửa hệ thống là giữ ba lớp nhất quán: **chứng từ nghiệp vụ -> nhật ký biến động -> số dư hiện tại**. Mọi thay đổi liên quan tồn kho hoặc sản xuất phải có đường đi thuận, đường hoàn tác, kiểm tra scope và audit rõ ràng.
