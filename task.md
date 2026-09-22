Logic Batch Mode — tích hợp vào pipeline hiện có

Đây là phần thay thế cho bước "gọi Gemini OCR trực tiếp" trong syncService.js cũ, cộng thêm 1 job xử lý riêng cho việc theo dõi batch. Đưa nguyên phần này cho AI code, giữ nguyên phần Drive/Sheets/Apps Script bridge đã có.

1. Thay đổi schema Google Sheet — thêm cột mới
   Cột thêm mới Ý nghĩa
   batch_id ID của batch job (Gemini trả về khi submit), dùng để tra cứu khi poll
   batch_request_key Key định danh riêng của ảnh này bên trong file JSONL gửi lên (để khi nhận kết quả biết map lại đúng dòng nào)

Trạng thái status mở rộng thêm:

pending → batching → batch_submitted → batch_processing → done / error
pending: ảnh mới phát hiện, chưa gom vào batch nào.
batching: đang trong quá trình gom (tránh 2 lần cron chồng nhau gom trùng).
batch_submitted: đã gửi lên Gemini, đang chờ xử lý.
batch_processing: Gemini xác nhận job đang chạy (optional, có thể gộp chung với batch_submitted nếu không cần phân biệt).
done / error: như cũ. 2. Bảng theo dõi batch job (thêm 1 sheet phụ, ví dụ tên batch_jobs)

Vì 1 batch job gắn với nhiều ảnh (nhiều dòng), cần 1 bảng riêng lưu trạng thái job:

Cột Ý nghĩa
batch_id ID job Gemini trả về
book_name Tên cuốn sách (folder con hoặc prefix tên file, để biết job này thuộc cuốn nào)
submitted_at Thời điểm submit
status pending / running / completed / failed / expired
last_checked_at Lần poll gần nhất
total_images Tổng số ảnh trong job này 3. Luồng SUBMIT (cron job A — chạy mỗi khi phát hiện batch mới cần gom)

1. Query Sheet: lấy tất cả dòng có status = 'pending'
2. Group theo book_name (dựa vào tên folder con trên Drive, hoặc prefix tên file
   theo quy ước — cần thống nhất: mỗi cuốn sách nên nằm trong 1 subfolder riêng
   trong Drive, để dễ group theo book_name = tên subfolder)
3. Với mỗi group đủ điều kiện (ví dụ: đã đợi đủ X phút không có ảnh mới thêm vào,
   để tránh submit khi cuốn đang upload dở — cấu hình qua BATCH_WAIT_BEFORE_SUBMIT_MINUTES):

   a. Set toàn bộ dòng trong group -> status = 'batching'

   b. Với mỗi ảnh: tải base64 (qua Apps Script action getImageBase64 đã có)

   c. Build file JSONL, mỗi dòng theo format Gemini Batch API yêu cầu, dạng:
   {
   "key": "<hash_hoặc_file_id_của_ảnh>",
   "request": {
   "contents": [{
   "parts": [
   { "text": "<prompt OCR>" },
   { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } }
   ]
   }]
   }
   }
   -> field "key" LUÔN dùng hash hoặc file_id (không dùng tên file),
   vì đây là thứ để map ngược lại đúng dòng trong Sheet khi nhận kết quả

   d. Gọi Gemini Batch API để tạo job (upload file JSONL, tạo batch job)
   -> nhận về batch_id

   e. Ghi 1 dòng mới vào sheet `batch_jobs`: batch_id, book_name,
   submitted_at = now, status = 'pending', total_images = N

   f. Update tất cả dòng ảnh trong group:
   status = 'batch_submitted', batch_id = <batch_id vừa nhận>,
   batch_request_key = <giá trị key đã dùng trong JSONL>

Lưu ý về kích thước: 500-1.000 ảnh trong 1 file JSONL có thể khá lớn (ảnh scan thường vài trăm KB - vài MB/ảnh). Cần kiểm tra giới hạn kích thước file batch của Gemini tại thời điểm code (giới hạn có thể thay đổi) — nếu 1 cuốn vượt giới hạn, cần logic chia nhỏ thành nhiều batch job cho cùng 1 cuốn (ví dụ mỗi job tối đa 200-300 ảnh), và bảng batch_jobs cần cho phép nhiều batch_id cùng book_name.

4. Luồng POLL (cron job B — chạy độc lập, mỗi 15-30 phút, cấu hình qua BATCH_POLL_INTERVAL_MINUTES)
1. Query sheet `batch_jobs`: lấy các dòng có status IN ('pending', 'running')

1. Với mỗi batch_id:
   a. Gọi Gemini API kiểm tra trạng thái job (get batch job status)

   b. Nếu status vẫn đang chạy -> update last_checked_at, bỏ qua, chờ lần poll sau

   c. Nếu status = 'failed' hoặc 'expired':
   -> update batch_jobs.status tương ứng
   -> update tất cả dòng ảnh liên quan (WHERE batch_id = ...)
   về status = 'error', error_message = 'Batch job failed/expired'
   -> (optional) tự động reset các dòng này về 'pending' để lần submit
   sau tự động gửi lại thành batch mới

   d. Nếu status = 'completed':
   -> Tải file kết quả JSONL từ Gemini
   -> Parse từng dòng kết quả, mỗi dòng có "key" (trùng với batch_request_key
   đã lưu) và "response" chứa text OCR
   -> Với mỗi kết quả: tìm dòng trong Sheet chính có batch_request_key khớp
   -> update ocr_text, status = 'done', updated_at = now
   -> Nếu có key nào trong job mà không thấy trả kết quả (lỗi 1 phần)
   -> đánh dấu riêng dòng đó status = 'error'
   -> update batch_jobs.status = 'completed'
   -> Trigger luôn bước exportMarkdown cho book_name này (gom ocr_text
   theo page_order, xuất pageN.md) vì cả cuốn đã xong

1. Thêm action mới cho Apps Script bridge (nếu vẫn giữ kiến trúc này)

Vì việc gọi Gemini Batch API cần thực hiện phía backend Docker (không phải phía Apps Script — Apps Script chỉ lo phần Drive/Sheets), các action Apps Script cần bổ sung chỉ là:

updateRowsByBatchId — update hàng loạt dòng theo batch_id (dùng ở bước 4c khi cần set toàn bộ dòng của 1 job lỗi về error cùng lúc, tránh phải gọi update từng dòng một → đỡ tốn quota Apps Script).
appendBatchJob / updateBatchJob — thao tác trên sheet batch_jobs.
readBatchJobs — đọc danh sách job đang pending/running để cron poll dùng.

Phần gọi Gemini Batch API (submit job, check status, tải kết quả) nằm hoàn toàn ở backend Docker, không qua Apps Script, vì đây là giao tiếp thẳng với Gemini, không liên quan Drive/Sheets.

6. Biến môi trường cần thêm vào .env.example

# Bật/tắt chế độ Batch (nếu false, dùng API đồng bộ như cũ - hợp với volume nhỏ)

USE_BATCH_MODE=true

# Đợi bao lâu sau ảnh cuối cùng upload mới submit batch (phút)

# tránh submit khi cuốn sách đang upload dở

BATCH_WAIT_BEFORE_SUBMIT_MINUTES=10

# Chu kỳ kiểm tra trạng thái batch job (phút)

BATCH_POLL_INTERVAL_MINUTES=20

# Số ảnh tối đa mỗi batch job (chia nhỏ nếu 1 cuốn vượt số này)

BATCH_MAX_IMAGES_PER_JOB=300 7. Yêu cầu quy ước thư mục (cần ghi rõ trong README cho người dùng)

Để hệ thống biết nhóm ảnh nào thuộc cuốn nào (group theo book_name), cần 1 quy ước bắt buộc: mỗi cuốn sách là 1 subfolder riêng trong Drive folder gốc, tên subfolder = tên cuốn. Backend khi list file cần đổi từ "list file trong 1 folder" sang "list subfolder → với mỗi subfolder, list file ảnh bên trong", và book_name = tên subfolder đó. Đây là thay đổi cần báo AI cập nhật lại cả phần listImages trong Apps Script.

8. Việc AI cần làm theo thứ tự
   Cập nhật listImages (Apps Script) → hỗ trợ quét theo subfolder, trả thêm field book_name.
   Cập nhật schema Sheet chính + tạo sheet phụ batch_jobs.
   Viết geminiBatchClient.js: hàm submitBatch(items), checkBatchStatus(batchId), fetchBatchResults(batchId).
   Viết lại syncService.js tách thành 2 hàm độc lập chạy 2 lịch cron riêng: submitPendingBatches() và pollRunningBatches().
   Cập nhật exportMarkdown.js để trigger theo book_name khi 1 batch hoàn tất, thay vì chạy toàn bộ mỗi lần cron như trước.
   Cập nhật README: quy ước subfolder theo cuốn, giải thích thời gian chờ kết quả (không tức thì), khuyến nghị bật billing.

Một điểm cần lưu ý khi báo AI: batch API của Gemini có thể thay đổi format field cụ thể (tên field trong JSONL, cách upload file, cách tạo job) theo thời gian — nên bảo AI kiểm tra tài liệu chính thức mới nhất của Gemini Batch API khi code, thay vì cứng nhắc theo đúng tên field ở trên (đây chỉ là cấu trúc logic minh hoạ, không phải spec API chính xác 100% tại thời điểm AI code).
