# Docker OCR — Google Apps Script Bridge + Gemini OCR + Markdown Export

Ứng dụng OCR tự động hoá nhận diện văn bản từ Google Drive bằng Gemini Vision API, quản lý trạng thái qua Google Sheets và tự động xuất các trang văn bản ra định dạng Markdown (`page1.md`, `page2.md`, ...).

> 💡 **Kiến trúc Apps Script Bridge**: Ứng dụng không cần Google Cloud Console hay Service Account phức tạp. Thay vào đó, một Apps Script Web App đóng vai trò proxy an toàn kết nối giữa backend và Google Drive / Google Sheets.

---

## Trạng thái hệ thống

- Cập nhật lần cuối: 2026-09-22 13:40
- Đã hoàn thành:
  - Tích hợp **Prompt Editor UI**: Cho phép chỉnh sửa prompt OCR trực tiếp từ giao diện, hỗ trợ nạp lại Prompt mặc định 10 quy tắc OCR tiếng Việt chuẩn xác (giữ nguyên ngoại ngữ, đánh dấu format `**in đậm**`, `*in nghiêng*`, `[CÓ HÌNH]`).
  - Giới hạn tối ưu strictly **3 Model Gemini Flash**: Mặc định `gemini-3.5-flash-lite`, Fallback 1 `gemini-3.1-flash-lite`, Fallback 2 `gemini-2.5-flash`.
  - **Xuất ZIP Markdown trực tiếp**: Bỏ phụ thuộc ghi file ra ổ đĩa `./output` / `./out`, khi bấm "Tải ZIP Markdown", hệ thống nén in-memory và tải thẳng tệp `.zip` về trình duyệt (chứa `page1.md`, `page2.md`...).
  - Quản lý Google Sheet theo schema cố định: `[fileName, status, driveFileId, ocrText, errorMessage, note]`.
  - Frontend UI Dashboard SvelteKit 5 (Runes) + TypeScript + Tailwind CSS.
  - Bộ kiểm thử Unit Tests Vitest (7/7 suites, 17/17 tests pass 100%).
- Đang dở: Không có
- Biết trước còn thiếu / nợ kỹ thuật: Không có

---

## Changelog

### 2026-09-22

- **Prompt Editor & 10-Rule OCR Standard**: Thêm modal tùy chỉnh prompt OCR, mặc định áp dụng 10 quy tắc OCR chuẩn hóa tiếng Việt và cụm ngoại ngữ nguyên văn.
- **Model Flash Restrict**: Tối ưu danh sách model sang 3 bản Flash siêu tốc: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`.
- **Zip Export Streaming**: Tạo endpoint `/api/export` nén trực tiếp in-memory bằng `jszip` và stream file `.zip` về client tải tự động.
- **Apps Script Custom Schema**: Cập nhật Apps Script bridge tương thích với cấu trúc cột `[fileName, status, driveFileId, ocrText, errorMessage, note]`.
- Kết quả pipeline: format ✅ | lint ✅ | type ✅ (`svelte-check` 0 error, 0 warning) | test ✅ (7/7 test suites pass, 17/17 tests) | knip ✅ (0 issue) | build ✅

---

## 1. Hướng dẫn thiết lập Google Apps Script Bridge từng bước

### Bước 1: Tạo Google Sheet & Dán mã nguồn Apps Script

1. Mở [Google Sheets](https://sheets.new) và tạo một bảng tính mới (trống).
2. Trên thanh menu, chọn **Tiện ích mở rộng (Extensions)** > **Apps Script**.
3. Xóa toàn bộ nội dung mặc định trong trình soạn thảo, mở file [`apps-script/Code.gs`](file:///home/hajtran/dev/docker-ocr/apps-script/Code.gs) trong repository này, sao chép toàn bộ nội dung và dán vào.

---

### Bước 2: Thiết lập Secret Token bảo mật

1. Trong giao diện Apps Script, bấm vào biểu tượng **Cài đặt dự án (Project Settings)** ⚙️ ở thanh bên trái.
2. Cuộn xuống mục **Thuộc tính tập lệnh (Script Properties)** > Bấm **Thêm thuộc tính tập lệnh (Add script property)**:
   - **Thuộc tính (Property)**: `SECRET_TOKEN`
   - **Giá trị (Value)**: Nhập một chuỗi ký tự bí mật bất kỳ do bạn tự đặt (ví dụ: `my-secret-ocr-2026`).
3. Bấm **Lưu thuộc tính tập lệnh (Save script properties)**.

---

### Bước 3: Triển khai thành Web App

1. Bấm nút **Triển khai (Deploy)** ở góc trên bên phải > chọn **Tùy chọn triển khai mới (New deployment)**.
2. Bấm vào biểu tượng bánh răng ⚙️ bên cạnh "Chọn loại" > chọn **Ứng dụng web (Web app)**.
3. Cấu hình như sau:
   - **Mô tả**: `Docker OCR Bridge`
   - **Thực thi dưới dạng (Execute as)**: `Tôi (Me - <email của bạn>)`
   - **Ai có quyền truy cập (Who has access)**: `Bất kỳ ai (Anyone)`
4. Bấm **Triển khai (Deploy)**.
5. Google sẽ hiện popup yêu cầu cấp quyền:
   - Bấm **Ủy quyền truy cập (Authorize access)** > Chọn tài khoản Google của bạn.
   - Nếu hiện cảnh báo _"Google chưa xác minh ứng dụng này"_, bấm **Nâng cao (Advanced)** > bấm **Đi tới Dự án (không an toàn)** > Bấm **Cho phép (Allow)**.
6. Sao chép **URL ứng dụng web (Web App URL)** (dạng `https://script.google.com/macros/s/AKfycb.../exec`).

> ⚠️ **LƯU Ý QUAN TRỌNG:**
> Mỗi khi bạn chỉnh sửa bất kỳ dòng code nào trong Apps Script, bạn **BẮT BUỘC** phải bấm **Triển khai (Deploy)** > **Quản lý bản triển khai (Manage deployments)** > Bấm icon bút chì ✏️ > Chọn **Phiên bản: Phiên bản mới (New version)** > Bấm **Triển khai** thì thay đổi mới có hiệu lực.

---

### Bước 4: Lấy Drive Folder ID & Gemini API Key

1. **Drive Folder ID**:
   - Mở thư mục Google Drive chứa ảnh cần OCR trên trình duyệt.
   - Đảm bảo tài khoản Google của bạn có quyền truy cập vào folder này (Viewer hoặc Editor).
   - Lấy ID từ URL trên trình duyệt:
     ```
     https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0jKLMNOP
     ==> DRIVE_FOLDER_ID = 1a2b3c4d5e6f7g8h9i0jKLMNOP
     ```
2. **Gemini API Key**:
   - Truy cập [Google AI Studio](https://aistudio.google.com/apikey).
   - Bấm **Create API key** và sao chép key.

---

## 2. Khởi chạy thử nghiệm giao diện (Development Mode)

1. Tạo file `.env` từ template:
   ```bash
   cp .env.example .env
   ```
2. Điền các giá trị vào `.env`:
   ```dotenv
   APPSCRIPT_WEB_APP_URL=https://script.google.com/macros/s/AKfycb.../exec
   APPSCRIPT_SECRET=my-secret-ocr-2026
   DRIVE_FOLDER_ID=1a2b3c4d5e6f7g8h9i0jKLMNOP
   GEMINI_API_KEY=AIzaSy...
   GEMINI_MODEL=gemini-1.5-flash
   POLL_INTERVAL_MINUTES=5
   MAX_CONCURRENCY=3
   OUTPUT_DIR=./output
   ```
3. Cài đặt và khởi chạy:
   ```bash
   pnpm install
   pnpm dev
   ```
4. Mở trình duyệt tại **`http://localhost:5173`** để trải nghiệm:
   - Bấm **"Chạy Test kết nối"** để kiểm tra tự động toàn bộ kết nối.
   - Xem preview ảnh từ Drive và kết quả OCR theo từng dòng.
   - Bấm **"Chạy Sync Ngay"** hoặc **"Xuất Markdown"**.

---

## 3. Triển khai bằng Docker

Khi đã kiểm tra xong, bạn có thể triển khai chạy nền liên tục với Docker Compose:

```bash
docker compose up -d --build
```

- Truy cập Web Dashboard tại: **`http://localhost:3000`**
- Xem logs hoạt động:
  ```bash
  docker compose logs -f
  ```
- Toàn bộ kết quả OCR sẽ được xuất ra thư mục `./output/page1.md`, `./output/page2.md`, ... trên máy của bạn.

---

## 4. Xử lý sự cố (Troubleshooting)

| Lỗi                                          | Nguyên nhân                                                   | Cách khắc phục                                                                 |
| -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `403 Unauthorized`                           | `APPSCRIPT_SECRET` trong `.env` không khớp với `SECRET_TOKEN` | Kiểm tra lại Script Properties trong Apps Script Settings và `.env`.           |
| `Không truy cập được folder Google Drive`    | Sai `DRIVE_FOLDER_ID` hoặc tài khoản chưa có quyền            | Đảm bảo ID đúng và tài khoản Google tạo Apps Script có quyền mở folder đó.     |
| `Gemini API test thất bại`                   | API key sai hoặc hết quota                                    | Kiểm tra `GEMINI_API_KEY` tại [AI Studio](https://aistudio.google.com/apikey). |
| Sửa code Apps Script nhưng kết quả không đổi | Chưa tạo New version khi Deploy                               | Vào Apps Script > Manage deployments > Edit > Chọn New version > Deploy lại.   |
