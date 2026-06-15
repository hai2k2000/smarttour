# SmartTour Code Review - 2026-06-13

## Phạm vi review

- Commit range: `c580e45..ce45c60`
- Tổng thay đổi: 62 files, 2.688 insertions, 594 deletions.
- `HEAD` trùng `origin/main`; working tree sạch tại thời điểm review.
- Review đối chiếu với `AGENTS.md` và tập trung vào workflow, audit actor, data scope, finance reconciliation, validation và runtime security.
- Không sửa code trong quá trình review.

## Báo cáo lỗi

| Mức độ | File | Đoạn logic có vấn đề | Rủi ro | Hướng sửa triệt để |
|---|---|---|---|---|
| High | `apps/api/src/modules/quotations/dto/quotation.dto.ts:48-61`<br>`apps/api/src/modules/quotations/quotations.service.ts:113-164,267-270,373-400` | DTO create/update vẫn nhận `status`, `smartLinkEnabled`; `toData()` ghi trực tiếp xuống DB. Các action approval vẫn lấy `actor` từ body. Việc đổi trạng thái và ghi audit không cùng transaction. | Người có `quotation.manage` có thể tạo thẳng quotation `APPROVED`, bật public link hoặc giả mạo actor mà không qua endpoint approval. Audit có thể thiếu nếu ghi log thất bại. | Loại `status`, `smartLinkEnabled`, `actor` khỏi DTO client. Create luôn `DRAFT`, SmartLink mặc định tắt. Chỉ action chuyên biệt được đổi trạng thái; actor lấy từ `request.user`. Dùng transaction hoặc conditional update theo trạng thái hiện tại và thêm test spoof/bypass. |
| High | `apps/api/src/modules/commission-reports/commission-reports.service.ts:187-230` | `syncFromOrders()` cập nhật lại `commissionAmount` và `remainingAmount` của mọi entry hiện có, không xét `status`, `paymentStatus` hoặc `paidAmount`. | Report đã duyệt/đã trả có thể thành `PAID` nhưng còn dư nợ; hoặc `paidAmount > commissionAmount`. Làm sai công nợ và audit tài chính. | Chỉ đồng bộ entry `PENDING + UNPAID`. Khóa và kiểm tra lại entry trong transaction. Với entry đã duyệt/trả, dùng workflow adjustment/reversal riêng, không ghi đè. Thêm test tăng/giảm commission sau partial/paid. |
| High | `apps/api/src/modules/quotes/quotes.controller.ts:62-107`<br>`apps/api/src/modules/quotes/quotes.service.ts:150-250`<br>`prisma/schema.prisma:445-462` | Toàn bộ QuoteCombo list/detail/write không nhận `request.user`, truy vấn trực tiếp không áp dụng scope. Model cũng không có branch/department/owner. | User có quyền quote ở một chi nhánh có thể xem và sửa combo toàn hệ thống, gồm giá net, lợi nhuận và supplier. | Bổ sung ownership/scope cho QuoteCombo, backfill dữ liệu và migration rõ ràng. Truyền user vào mọi endpoint, áp dụng scope cho list/detail/write và kiểm tra supplier thuộc scope. Nếu combo thực sự dùng chung toàn hệ thống, cần permission riêng thay vì dùng `quote.view/manage`. |
| High | `apps/api/src/modules/operation-vouchers/operation-vouchers.service.ts:222-243`<br>`scripts/test-operation-vouchers-service.sh:296-312` | Service kiểm tra công nợ bằng amount client trước khi tải FinancePayment; sau đó chỉ yêu cầu amount client không lớn hơn `paymentAmount`. Một FinancePayment 100 có thể bị ghi nhận 60 rồi bị khóa không cho dùng lại. | Số tiền thực chi và số giảm công nợ lệch nhau; phần tiền còn lại bị mắc kẹt, gây sai đối soát. | Nếu quan hệ một payment-một voucher, lấy `FinancePayment.paymentAmount` làm giá trị server-authoritative, bỏ amount client hoặc bắt buộc bằng tuyệt đối; thêm unique constraint cho `paymentVoucherId`. Nếu cho phép phân bổ, cần mô hình allocation và kiểm tra tổng allocation trong transaction. |
| Medium | `apps/api/src/modules/reports/dto/report-query.dto.ts:22-64`<br>`apps/api/src/modules/reports/reports.service.ts:231-298,650-655` | DTO gộp enum của Order và Tour. Giá trị hợp lệ với Tour được chấp nhận ở report Order nhưng sau đó bị âm thầm bỏ; date field không phù hợp bị đổi thành `createdAt`. | API trả `200` với dữ liệu không đúng filter, gây sai báo cáo. Kiểm chứng runtime: `type=FIT` trên Order không tạo filter; `dateField=closedAt` bị đổi thành `createdAt`. | Tách DTO theo nhóm Order/Tour hoặc validate theo endpoint. Trả `400` cho type/status/dateField không tương thích, không fallback im lặng. |
| Medium | `apps/api/src/modules/quotations/quotations.service.ts:65-109,435-440` | Public endpoint chỉ chấp nhận token bảo mật dài 43 ký tự, nhưng không có migration/backfill cho token cũ dạng slug-timestamp. | SmartLink đã gửi trước deploy sẽ lập tức trả 404. VPS hiện có `0` quotation nên chưa phát sinh tại đây, nhưng môi trường có dữ liệu sẽ bị ảnh hưởng. | Thêm pre-deploy audit/backfill token cũ, rotate link và lập danh sách quotation cần gửi lại URL. Chặn deploy nếu còn SmartLink đang bật với token legacy. |
| Medium | `apps/api/src/config/runtime-env.ts:13-19,32-60` | `normalizeOrigin()` trả nguyên chuỗi nếu parse URL thất bại; production chỉ kiểm tra danh sách không rỗng. `NEXT_PUBLIC_API_URL` cũng được coi là browser CORS origin. | Env sai cú pháp vẫn qua startup nhưng toàn bộ request cross-origin hợp lệ có thể bị chặn. | Reject origin không phải URL `http/https`, không chứa credentials/path không hợp lệ. Production nên yêu cầu origin frontend chuyên biệt; thêm test env sai và wildcard. |
| Low | `apps/web/Dockerfile:3-5` | Image production dùng `npm install` thay vì `npm ci`. | Build không fail-fast khi manifest lệch lockfile và kém tái lập. | Copy đủ workspace manifests rồi dùng `npm ci` cho cả API/Web Dockerfile. |

## Kết quả kiểm chứng

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `git status` | Pass | Working tree sạch, `main` trùng `origin/main`. |
| `git diff --check c580e45..HEAD` | Pass | Không có whitespace error. |
| `docker compose config --quiet` | Pass | Compose config hợp lệ. |
| `scripts/verify-toolchain-docker.sh` | Pass | TypeScript lint và Prisma validate thành công trong container tạm. |
| Docker `npm audit` | Pass | `0 vulnerabilities`. |
| Host `npm run lint` | Fail do toolchain host | `node_modules/.bin/tsc` bị hỏng với lỗi `Cannot find module ../lib/tsc.js`; Docker verification đã thay thế thành công. |

## Kết luận

- Không phát hiện lỗi Critical mới.
- Còn 4 lỗi High liên quan workflow quotation, commission sync, QuoteCombo data scope và đối soát operation payment.
- Chưa nên chuyển thẳng sang test/deploy cho tới khi các lỗi High trên được xử lý và có regression test tương ứng.
