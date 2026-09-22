/**
 * GOOGLE APPS SCRIPT BRIDGE FOR DOCKER OCR (Schema Tùy Biến)
 *
 * Cấu trúc cột Google Sheet (Row 1 cố định):
 * [ Cột A: fileName | Cột B: status | Cột C: driveFileId | Cột D: ocrText | Cột E: errorMessage | Cột F: note ]
 *
 * Hướng dẫn:
 * 1. Mở file Google Sheet của bạn.
 * 2. Chọn Tiện ích mở rộng (Extensions) > Apps Script.
 * 3. Dán toàn bộ mã nguồn này vào.
 * 4. Vào Cài đặt dự án (Project Settings ⚙️) > Script Properties:
 *    - Key: SECRET_TOKEN
 *    - Value: <nhập token bí mật do bạn tự đặt>
 * 5. Bấm Triển khai (Deploy) > Tùy chọn triển khai mới (New deployment):
 *    - Loại: Web app
 *    - Thực thi dưới dạng: Tôi (Me)
 *    - Ai có quyền truy cập: Bất kỳ ai (Anyone)
 *    - Bấm Triển khai > Cấp quyền truy cập (Authorize access).
 *
 * LƯU Ý QUAN TRỌNG:
 * Mỗi lần chỉnh sửa code trong Apps Script, bạn BẮT BUỘC phải tạo Bản triển khai mới (New deployment)
 * hoặc Quản lý bản triển khai > Chỉnh sửa > Chọn Phiên bản mới (New version).
 */

const SHEET_HEADERS = ['fileName', 'status', 'driveFileId', 'ocrText', 'errorMessage', 'note'];

/**
 * Xử lý khi mở URL trực tiếp trên trình duyệt (GET request)
 */
function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
  const isConfigured = Boolean(token);

  return jsonResponse({
    status: 'ok',
    message: 'Google Apps Script Bridge cho Docker OCR đang hoạt động!',
    secretTokenConfigured: isConfigured,
    schema: SHEET_HEADERS,
    usage: 'Backend Docker OCR sẽ gửi các POST request đến URL này kèm token và action.',
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ error: 'Missing request body' }, 400);
    }

    const body = JSON.parse(e.postData.contents);
    const expectedToken = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');

    if (!expectedToken) {
      return jsonResponse(
        { error: 'SECRET_TOKEN has not been configured in Script Properties' },
        500,
      );
    }

    if (!body.token || body.token !== expectedToken) {
      return jsonResponse({ error: 'Unauthorized: Invalid secret token' }, 403);
    }

    switch (body.action) {
      case 'ensureHeader':
        return jsonResponse(ensureHeader());
      case 'listImages':
        return jsonResponse(listImages(body.folderId));
      case 'getImageBase64':
        return jsonResponse(getImageBase64(body.fileId));
      case 'readSheetRows':
        return jsonResponse(readSheetRows());
      case 'appendRow':
        return jsonResponse(appendRow(body.data));
      case 'updateRow':
        return jsonResponse(updateRow(body.driveFileId || body.hash, body.data));
      default:
        return jsonResponse({ error: 'Unknown action: ' + body.action }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.toString() }, 500);
  }
}

function jsonResponse(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Đảm bảo header của Google Sheet đã có sẵn
 */
function ensureHeader() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    sheet.appendRow(SHEET_HEADERS);
    return { success: true, message: 'Header row created' };
  }

  // Đọc header hiện có
  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(lastCol, SHEET_HEADERS.length))
    .getValues()[0];
  return { success: true, message: 'Headers OK: ' + currentHeaders.filter(Boolean).join(', ') };
}

/**
 * Quét danh sách file ảnh trong thư mục Google Drive
 */
function listImages(folderId) {
  if (!folderId) {
    throw new Error('folderId is required');
  }

  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const result = [];

  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();

    if (mimeType && mimeType.indexOf('image/') === 0) {
      const fileId = file.getId();
      const fileName = file.getName();
      const createdTime = file.getDateCreated().toISOString();

      // Tính MD5 hash từ nội dung file
      const bytes = file.getBlob().getBytes();
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes);
      let md5Checksum = '';
      for (let i = 0; i < digest.length; i++) {
        let byteVal = digest[i];
        if (byteVal < 0) byteVal += 256;
        const byteHex = byteVal.toString(16);
        md5Checksum += (byteHex.length === 1 ? '0' : '') + byteHex;
      }

      result.push({
        id: fileId,
        name: fileName,
        md5Checksum: md5Checksum || fileId,
        createdTime: createdTime,
        mimeType: mimeType,
      });
    }
  }

  return { success: true, folderName: folder.getName(), files: result };
}

/**
 * Tải ảnh và mã hoá Base64
 */
function getImageBase64(fileId) {
  if (!fileId) {
    throw new Error('fileId is required');
  }

  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());

  return {
    success: true,
    base64: base64,
    mimeType: file.getMimeType() || 'image/jpeg',
    fileName: file.getName(),
  };
}

/**
 * Đọc tất cả các dòng dữ liệu trong Google Sheet theo schema [fileName, status, driveFileId, ocrText, errorMessage, note]
 */
function readSheetRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return { success: true, records: [] };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS.length).getValues();
  const records = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowIndex = i + 2;

    records.push({
      fileName: (row[0] || '').toString(),
      status: (row[1] || 'pending').toString(),
      driveFileId: (row[2] || '').toString(),
      ocrText: (row[3] || '').toString(),
      errorMessage: (row[4] || '').toString(),
      note: (row[5] || '').toString(),
      rowIndex: rowIndex,
    });
  }

  return { success: true, records: records };
}

/**
 * Thêm 1 dòng mới vào Google Sheet
 */
function appendRow(item) {
  if (!item) {
    throw new Error('data object is required');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const rowData = [
    item.fileName || item.file_name || '',
    item.status || 'pending',
    item.driveFileId || item.file_id || '',
    item.ocrText || item.ocr_text || '',
    item.errorMessage || item.error_message || '',
    item.note || item.hash || '',
  ];

  sheet.appendRow(rowData);
  const rowIndex = sheet.getLastRow();
  return { success: true, rowIndex: rowIndex };
}

/**
 * Cập nhật dòng theo driveFileId (Cột C) hoặc hash trong note (Cột F)
 */
function updateRow(identifier, updateFields) {
  if (!identifier) {
    throw new Error('identifier (driveFileId or hash) is required for updateRow');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: false, error: 'Sheet has no data rows' };
  }

  // Đọc dữ liệu cột driveFileId (Cột C) và cột note (Cột F)
  const allValues = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS.length).getValues();
  let targetRowIndex = -1;

  for (let i = 0; i < allValues.length; i++) {
    const rowDriveFileId = (allValues[i][2] || '').toString();
    const rowNote = (allValues[i][5] || '').toString();
    const rowFileName = (allValues[i][0] || '').toString();

    if (
      rowDriveFileId === identifier.toString() ||
      rowNote === identifier.toString() ||
      rowFileName === identifier.toString()
    ) {
      targetRowIndex = i + 2;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, error: 'Row not found for identifier: ' + identifier };
  }

  const currentRow = sheet.getRange(targetRowIndex, 1, 1, SHEET_HEADERS.length).getValues()[0];
  const updatedRow = [
    updateFields.fileName !== undefined ? updateFields.fileName : currentRow[0],
    updateFields.status !== undefined ? updateFields.status : currentRow[1],
    updateFields.driveFileId !== undefined ? updateFields.driveFileId : currentRow[2],
    updateFields.ocrText !== undefined ? updateFields.ocrText : currentRow[3],
    updateFields.errorMessage !== undefined ? updateFields.errorMessage : currentRow[4],
    updateFields.note !== undefined ? updateFields.note : currentRow[5],
  ];

  sheet.getRange(targetRowIndex, 1, 1, SHEET_HEADERS.length).setValues([updatedRow]);
  return { success: true, rowIndex: targetRowIndex };
}
