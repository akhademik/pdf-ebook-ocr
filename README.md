# Docker OCR — Google Apps Script Bridge + Gemini Batch & Realtime OCR + Markdown Export

Ứng dụng OCR tự động hoá nhận diện văn bản từ Google Drive bằng Gemini Vision API (hỗ trợ cả chế độ Realtime và **Gemini Batch API giảm 50% chi phí**), quản lý trạng thái qua Google Sheets và tự động xuất các trang văn bản ra file nén ZIP Markdown (`page1.md`, `page2.md`, ... theo từng cuốn sách).

> 💡 **Kiến trúc Apps Script Bridge**: Ứng dụng không cần Google Cloud Console hay Service Account phức tạp. Thay vào đó, một Apps Script Web App đóng vai trò proxy an toàn kết nối giữa backend và Google Drive / Google Sheets.

---

## Trạng thái hệ thống

- Cập nhật lần cuối: 2026-09-22 13:50
- Đã hoàn thành:
  - **Gemini Batch API Mode (`task.md`)**: Hỗ trợ gom hàng trăm/hàng nghìn trang ảnh theo từng cuốn sách (subfolder), tự động build JSONL, upload lên Google AI File API, tạo Batch Job và định kỳ poll kết quả (giảm 50% chi phí API).
  - **Quản lý 2 bảng Google Sheet**:
    - Sheet chính: `[fileName, status, driveFileId, ocrText, errorMessage, note, bookName, batchId, batchRequestKey]`
    - Sheet phụ `batch_jobs`: `[batchId, bookName, submittedAt, status, lastCheckedAt, totalImages, errorMessage]`
  - **Tự động quét theo Subfolder (Quy ước mỗi cuốn sách 1 thư mục con)**: Quét toàn bộ thư mục con bên trong Drive Folder, tự động gán `bookName` bằng tên thư mục con.
  - **Prompt Editor UI**: Tùy chỉnh prompt OCR trực tiếp từ giao diện, mặc định 10 quy tắc OCR tiếng Việt chuẩn xác (giữ nguyên ngoại ngữ nguyên văn, định dạng Markdown `**đậm**`, `*nghiêng*`, `[CÓ HÌNH]`).
  - **Xuất ZIP Markdown phân cấp**: Nén in-memory tải thẳng `.zip` về máy, tự động gom file Markdown vào folder tên sách tương ứng.
  - **3 Model Gemini Flash**: Mặc định `gemini-3.5-flash-lite`, Fallback 1 `gemini-3.1-flash-lite`, Fallback 2 `gemini-2.5-flash`.
  - Frontend UI Dashboard SvelteKit 5 (Runes) + TypeScript + Tailwind CSS.
  - Bộ kiểm thử Unit Tests Vitest (8/8 suites, 21/21 tests pass 100%).
- Đang dở: Không có
- Biết trước còn thiếu / nợ kỹ thuật: Không có

---

## Changelog

### 2026-09-22

- **Batch Mode Pipeline (`task.md`)**: Triển khai `GeminiBatchClient`, `submitPendingBatches()`, `pollRunningBatches()`, và scheduler 2 cron độc lập.
- **Apps Script Multi-sheet & Subfolder Support**: Cập nhật `apps-script/Code.gs` tự động tạo header, hỗ trợ quét subfolder và bảng `batch_jobs`.
- **UI Batch Monitoring**: Thêm component `BatchJobsTable`, bổ sung nút kiểm tra batch và cập nhật trạng thái `batch_submitted`, `batching`.
- **Prompt Editor & Zip Exporter**: Tùy chỉnh prompt OCR và tải file zip in-memory không cần ổ đĩa cục bộ.
- Kết quả pipeline: format ✅ | lint ✅ | type ✅ (`svelte-check` 0 error) | test ✅ (8/8 suites, 21/21 tests) | knip ✅ (0 issue) | build ✅

---

## 1. Định dạng Header và Cấu trúc Google Sheet (Yêu cầu khởi tạo)

Bảng tính Google Sheets của bạn cần có **2 trang tính (sheets)**:

### 1.1 Trang tính 1 (Sheet chính - Đặt tên mặc định `Sheet1` hoặc trang đầu tiên)
Dòng 1 (Row 1 Header) bao gồm 9 cột cố định:

| Cột | Tên Header | Ý nghĩa |
| :--- | :--- | :--- |
| **A** | `fileName` | Tên file ảnh (ví dụ: `001.jpg`, `page_001.png`) |
| **B** | `status` | Trạng thái (`pending`, `batching`, `batch_submitted`, `processing`, `done`, `error`) |
| **C** | `driveFileId` | ID định danh của file trên Google Drive |
| **D** | `ocrText` | Kết quả văn bản OCR nhận diện được |
| **E** | `errorMessage` | Thông báo lỗi chi tiết nếu quá trình OCR gặp sự cố |
| **F** | `note` | Ghi chú hoặc MD5 Checksum của file ảnh |
| **G** | `bookName` | Tên cuốn sách (tự động lấy theo tên thư mục con trên Drive) |
| **H** | `batchId` | ID của lô Batch Job trên Gemini |
| **I** | `batchRequestKey`| Khóa định danh ảnh trong file JSONL gửi lên Gemini Batch API |

### 1.2 Trang tính 2 (Sheet phụ - Đặt tên chính xác là `batch_jobs`)
Bấm nút `+` ở góc dưới Google Sheet để thêm trang tính mới và đổi tên thành **`batch_jobs`**.
Dòng 1 (Row 1 Header) bao gồm 7 cột:

| Cột | Tên Header | Ý nghĩa |
| :--- | :--- | :--- |
| **A** | `batchId` | ID Batch Job do Gemini trả về |
| **B** | `bookName` | Tên cuốn sách của lô ảnh này |
| **C** | `submittedAt` | Thời điểm gửi batch lên Gemini |
| **D** | `status` | Trạng thái job (`pending`, `running`, `completed`, `failed`, `expired`) |
| **E** | `lastCheckedAt` | Lần kiểm tra trạng thái gần nhất |
| **F** | `totalImages` | Tổng số lượng trang/ảnh trong batch |
| **G** | `errorMessage` | Thông báo lỗi nếu batch thất bại |

> 💡 *Lưu ý*: Hàm `ensureHeader` trong Apps Script cũng sẽ tự động kiểm tra và khởi tạo các cột/sheet trên nếu chưa có khi bạn bấm **"Kiểm tra kết nối" (Setup Check)** trên Dashboard.

---

## 2. Quy ước Thư mục trên Google Drive (Group theo cuốn sách)

Để hệ thống tự động nhận diện và gom nhóm ảnh theo từng cuốn sách (`bookName`), hãy tổ chức thư mục trên Google Drive như sau:

```text
📁 THƯ MỤC GỐC (DRIVE_FOLDER_ID)
 ├── 📁 Cuon_Sach_A/
 │    ├── 001_trang_1.jpg
 │    ├── 002_trang_2.jpg
 │    └── 003_trang_3.jpg
 ├── 📁 Cuon_Sach_B/
 │    ├── page_01.png
 │    └── page_02.png
 └── (ảnh lẻ ở thư mục gốc sẽ được gán bookName = tên thư mục gốc hoặc "Default")
```

---

## 3. Hướng dẫn thiết lập Google Apps Script Bridge

### Bước 1: Dán mã nguồn Apps Script
1. Mở file [Google Sheets](https://sheets.new) của bạn.
2. Trên thanh menu, chọn **Tiện ích mở rộng (Extensions)** > **Apps Script**.
3. Xóa toàn bộ nội dung mặc định, mở file [`apps-script/Code.gs`](file:///home/hajtran/dev/docker-ocr/apps-script/Code.gs) trong repo này, sao chép toàn bộ nội dung và dán vào.

### Bước 2: Đặt Secret Token bảo mật
1. Trong giao diện Apps Script, bấm vào biểu tượng **Cài đặt dự án (Project Settings)** ⚙️ ở thanh bên trái.
2. Cuộn xuống **Thuộc tính tập lệnh (Script Properties)** > Bấm **Thêm thuộc tính tập lệnh**:
   - **Thuộc tính (Property)**: `SECRET_TOKEN`
   - **Giá trị (Value)**: Nhập một chuỗi ký tự bí mật bất kỳ do bạn tự đặt (ví dụ: `my-secret-ocr-2026`).
3. Bấm **Lưu thuộc tính tập lệnh**.

### Bước 3: Triển khai thành Web App
1. Bấm nút **Triển khai (Deploy)** ở góc trên bên phải > chọn **Tùy chọn triển khai mới (New deployment)**.
2. Chọn loại **Ứng dụng web (Web app)**:
   - **Thực thi dưới dạng (Execute as)**: `Tôi (Me)`
   - **Ai có quyền truy cập (Who has access)**: `Bất kỳ ai (Anyone)`
3. Bấm **Triển khai (Deploy)** > Cấp quyền truy cập (Authorize access).
4. Sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/.../exec`).

---

## 4. Cấu hình biến môi trường (`.env`)

Tạo file `.env` từ `.env.example`:

```dotenv
# Apps Script Bridge
APPSCRIPT_WEB_APP_URL=https://script.google.com/macros/s/AKfycb.../exec
APPSCRIPT_SECRET=my-secret-ocr-2026

# Google Drive folder ID gốc chứa các thư mục sách
DRIVE_FOLDER_ID=1a2b3c4d5e6f7g8h9i0jKLMNOP

# Gemini API key (https://aistudio.google.com/apikey)
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-3.5-flash-lite

# Bật/tắt chế độ Batch (true: dùng Gemini Batch API giảm 50% phí, false: OCR trực tiếp)
USE_BATCH_MODE=true

# Thời gian chờ sau ảnh cuối cùng upload mới submit (phút)
BATCH_WAIT_BEFORE_SUBMIT_MINUTES=10

# Chu kỳ kiểm tra trạng thái batch job (phút)
BATCH_POLL_INTERVAL_MINUTES=20

# Số ảnh tối đa mỗi batch job (chia nhỏ nếu cuốn quá lớn)
BATCH_MAX_IMAGES_PER_JOB=300

# Chu kỳ quét Drive tìm ảnh mới (phút)
POLL_INTERVAL_MINUTES=5
MAX_CONCURRENCY=3
```

---

## 5. Chạy ứng dụng

### Chạy chế độ Phát triển (Dev Mode)
```bash
pnpm install
pnpm run dev
```
Mở trình duyệt tại `http://localhost:5173`.

### Chạy bằng Docker Compose
```bash
docker compose up -d --build
```
Mở trình duyệt tại `http://localhost:3000`.
