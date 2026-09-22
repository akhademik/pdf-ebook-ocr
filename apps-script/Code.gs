/**
 * GOOGLE APPS SCRIPT BRIDGE FOR DOCKER OCR (Hỗ trợ Realtime & Batch Mode)
 *
 * Cấu trúc 2 Sheet:
 * 1. Sheet chính (Sheet 1):
 *    [ fileName | status | driveFileId | ocrText | errorMessage | note | bookName | batchId | batchRequestKey ]
 *
 * 2. Sheet phụ (Sheet "batch_jobs"):
 *    [ batchId | bookName | submittedAt | status | lastCheckedAt | totalImages | errorMessage ]
 *
 * Hướng dẫn thiết lập:
 * 1. Mở file Google Sheet của bạn.
 * 2. Chọn Tiện ích mở rộng (Extensions) > Apps Script.
 * 3. Dán toàn bộ mã nguồn này vào file Code.gs.
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

const MAIN_SHEET_HEADERS = [
  'fileName',
  'status',
  'driveFileId',
  'ocrText',
  'errorMessage',
  'note',
  'bookName',
  'batchId',
  'batchRequestKey',
];

const BATCH_JOBS_SHEET_NAME = 'batch_jobs';
const BATCH_JOBS_HEADERS = [
  'batchId',
  'bookName',
  'submittedAt',
  'status',
  'lastCheckedAt',
  'totalImages',
  'errorMessage',
];

/**
 * Xử lý khi mở URL trực tiếp trên trình duyệt (GET request)
 */
function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
  const isConfigured = Boolean(token);

  return jsonResponse({
    status: 'ok',
    message: 'Google Apps Script Bridge cho Docker OCR (Batch & Realtime) đang hoạt động!',
    secretTokenConfigured: isConfigured,
    mainSchema: MAIN_SHEET_HEADERS,
    batchJobsSchema: BATCH_JOBS_HEADERS,
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
        return jsonResponse(
          updateRow(body.driveFileId || body.hash || body.batchRequestKey, body.data),
        );
      case 'batchUpdateRows':
        return jsonResponse(batchUpdateRows(body.updates));
      case 'updateRowsByBatchId':
        return jsonResponse(updateRowsByBatchId(body.batchId, body.data));
      case 'readBatchJobs':
        return jsonResponse(readBatchJobs());
      case 'appendBatchJob':
        return jsonResponse(appendBatchJob(body.data));
      case 'updateBatchJob':
        return jsonResponse(updateBatchJob(body.batchId, body.data));
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
 * Đảm bảo header của Google Sheet chính và sheet batch_jobs
 */
function ensureHeader() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheets()[0];

  // 1. Kiểm tra / khởi tạo Main Sheet Headers
  const lastRow = mainSheet.getLastRow();
  const lastCol = mainSheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    mainSheet.appendRow(MAIN_SHEET_HEADERS);
  } else {
    // Đọc header hiện có, nếu thiếu các cột mới (bookName, batchId, batchRequestKey) thì append thêm vào dòng 1
    const currentHeaders = mainSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    if (currentHeaders.length < MAIN_SHEET_HEADERS.length) {
      const missingHeaders = MAIN_SHEET_HEADERS.slice(currentHeaders.length);
      if (missingHeaders.length > 0) {
        mainSheet
          .getRange(1, currentHeaders.length + 1, 1, missingHeaders.length)
          .setValues([missingHeaders]);
      }
    }
  }

  // 2. Kiểm tra / khởi tạo Batch Jobs Sheet
  let batchSheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (!batchSheet) {
    batchSheet = ss.insertSheet(BATCH_JOBS_SHEET_NAME);
    batchSheet.appendRow(BATCH_JOBS_HEADERS);
  } else if (batchSheet.getLastRow() === 0) {
    batchSheet.appendRow(BATCH_JOBS_HEADERS);
  }

  return {
    success: true,
    message: 'Headers and sheets ensured successfully',
    mainSheetHeaders: MAIN_SHEET_HEADERS,
    batchJobsHeaders: BATCH_JOBS_HEADERS,
  };
}

/**
 * Quét danh sách file ảnh trong thư mục Google Drive (Hỗ trợ gom nhóm subfolder = bookName)
 */
function listImages(folderId) {
  if (!folderId) {
    throw new Error('folderId is required');
  }

  const rootFolder = DriveApp.getFolderById(folderId);
  const result = [];

  function collectImagesFromFolder(folder, bookName) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();

      if (mimeType && mimeType.indexOf('image/') === 0) {
        const fileId = file.getId();
        const fileName = file.getName();
        const createdTime = file.getDateCreated().toISOString();

        // MD5 hash
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
          bookName: bookName || 'Default',
        });
      }
    }
  }

  // 1. Quét các file ở thư mục gốc (bookName = tên thư mục gốc hoặc "Default")
  collectImagesFromFolder(rootFolder, rootFolder.getName());

  // 2. Quét các thư mục con (mỗi thư mục con là 1 cuốn sách: bookName = tên thư mục con)
  const subfolders = rootFolder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    collectImagesFromFolder(subfolder, subfolder.getName());
  }

  return { success: true, folderName: rootFolder.getName(), files: result };
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
 * Đọc tất cả các dòng dữ liệu trong Google Sheet chính
 */
function readSheetRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), MAIN_SHEET_HEADERS.length);

  if (lastRow <= 1) {
    return { success: true, records: [] };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
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
      bookName: (row[6] || 'Default').toString(),
      batchId: (row[7] || '').toString(),
      batchRequestKey: (row[8] || '').toString(),
      rowIndex: rowIndex,
    });
  }

  return { success: true, records: records };
}

/**
 * Thêm 1 dòng mới vào Google Sheet chính
 */
function appendRow(item) {
  if (!item) {
    throw new Error('data object is required');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const rowData = [
    item.fileName || item.file_name || '',
    item.status || 'pending',
    item.driveFileId || item.file_id || '',
    item.ocrText || item.ocr_text || '',
    item.errorMessage || item.error_message || '',
    item.note || item.hash || '',
    item.bookName || item.book_name || 'Default',
    item.batchId || item.batch_id || '',
    item.batchRequestKey || item.batch_request_key || '',
  ];

  sheet.appendRow(rowData);
  const rowIndex = sheet.getLastRow();
  return { success: true, rowIndex: rowIndex };
}

/**
 * Cập nhật 1 dòng trong sheet chính theo driveFileId / note / batchRequestKey
 */
function updateRow(identifier, updateFields) {
  if (!identifier) {
    throw new Error('identifier is required for updateRow');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: false, error: 'Sheet has no data rows' };
  }

  const colCount = MAIN_SHEET_HEADERS.length;
  const allValues = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  let targetRowIndex = -1;

  for (let i = 0; i < allValues.length; i++) {
    const rowDriveFileId = (allValues[i][2] || '').toString();
    const rowNote = (allValues[i][5] || '').toString();
    const rowFileName = (allValues[i][0] || '').toString();
    const rowBatchKey = (allValues[i][8] || '').toString();

    if (
      rowDriveFileId === identifier.toString() ||
      rowBatchKey === identifier.toString() ||
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

  const currentRow = sheet.getRange(targetRowIndex, 1, 1, colCount).getValues()[0];
  const updatedRow = [
    updateFields.fileName !== undefined ? updateFields.fileName : currentRow[0],
    updateFields.status !== undefined ? updateFields.status : currentRow[1],
    updateFields.driveFileId !== undefined ? updateFields.driveFileId : currentRow[2],
    updateFields.ocrText !== undefined ? updateFields.ocrText : currentRow[3],
    updateFields.errorMessage !== undefined ? updateFields.errorMessage : currentRow[4],
    updateFields.note !== undefined ? updateFields.note : currentRow[5],
    updateFields.bookName !== undefined ? updateFields.bookName : currentRow[6],
    updateFields.batchId !== undefined ? updateFields.batchId : currentRow[7],
    updateFields.batchRequestKey !== undefined ? updateFields.batchRequestKey : currentRow[8],
  ];

  sheet.getRange(targetRowIndex, 1, 1, colCount).setValues([updatedRow]);
  return { success: true, rowIndex: targetRowIndex };
}

/**
 * Cập nhật nhiều dòng hàng loạt theo danh sách updates [{ identifier, data }]
 */
function batchUpdateRows(updates) {
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: false, error: 'Sheet has no data rows' };
  }

  const colCount = MAIN_SHEET_HEADERS.length;
  const allValues = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();

  // Index map: key -> row index in allValues (0-based)
  const mapKeyToRow = new Map();
  for (let i = 0; i < allValues.length; i++) {
    const driveId = (allValues[i][2] || '').toString();
    const batchKey = (allValues[i][8] || '').toString();
    const fileName = (allValues[i][0] || '').toString();

    if (driveId) mapKeyToRow.set(driveId, i);
    if (batchKey) mapKeyToRow.set(batchKey, i);
    if (fileName) mapKeyToRow.set(fileName, i);
  }

  let updatedCount = 0;
  for (let u = 0; u < updates.length; u++) {
    const item = updates[u];
    const targetIdx = mapKeyToRow.get(item.identifier?.toString());
    if (targetIdx !== undefined) {
      const cur = allValues[targetIdx];
      const patch = item.data || {};

      if (patch.fileName !== undefined) cur[0] = patch.fileName;
      if (patch.status !== undefined) cur[1] = patch.status;
      if (patch.driveFileId !== undefined) cur[2] = patch.driveFileId;
      if (patch.ocrText !== undefined) cur[3] = patch.ocrText;
      if (patch.errorMessage !== undefined) cur[4] = patch.errorMessage;
      if (patch.note !== undefined) cur[5] = patch.note;
      if (patch.bookName !== undefined) cur[6] = patch.bookName;
      if (patch.batchId !== undefined) cur[7] = patch.batchId;
      if (patch.batchRequestKey !== undefined) cur[8] = patch.batchRequestKey;

      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    sheet.getRange(2, 1, lastRow - 1, colCount).setValues(allValues);
  }

  return { success: true, updatedCount: updatedCount };
}

/**
 * Cập nhật toàn bộ các dòng thuộc cùng 1 batchId trong sheet chính
 */
function updateRowsByBatchId(batchId, updateFields) {
  if (!batchId) {
    throw new Error('batchId is required');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, updatedCount: 0 };
  }

  const colCount = MAIN_SHEET_HEADERS.length;
  const allValues = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  let updatedCount = 0;

  for (let i = 0; i < allValues.length; i++) {
    const rowBatchId = (allValues[i][7] || '').toString();
    if (rowBatchId === batchId.toString()) {
      if (updateFields.status !== undefined) allValues[i][1] = updateFields.status;
      if (updateFields.errorMessage !== undefined) allValues[i][4] = updateFields.errorMessage;
      if (updateFields.ocrText !== undefined) allValues[i][3] = updateFields.ocrText;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    sheet.getRange(2, 1, lastRow - 1, colCount).setValues(allValues);
  }

  return { success: true, updatedCount: updatedCount };
}

/**
 * Đọc tất cả các dòng từ sheet "batch_jobs"
 */
function readBatchJobs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (!sheet) {
    return { success: true, records: [] };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, records: [] };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, BATCH_JOBS_HEADERS.length).getValues();
  const records = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    records.push({
      batchId: (row[0] || '').toString(),
      bookName: (row[1] || '').toString(),
      submittedAt: (row[2] || '').toString(),
      status: (row[3] || 'pending').toString(),
      lastCheckedAt: (row[4] || '').toString(),
      totalImages: parseInt((row[5] || '0').toString(), 10) || 0,
      errorMessage: (row[6] || '').toString(),
      rowIndex: i + 2,
    });
  }

  return { success: true, records: records };
}

/**
 * Thêm 1 dòng batch job mới vào sheet "batch_jobs"
 */
function appendBatchJob(item) {
  if (!item) {
    throw new Error('batch job data is required');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BATCH_JOBS_SHEET_NAME);
    sheet.appendRow(BATCH_JOBS_HEADERS);
  }

  const rowData = [
    item.batchId || item.batch_id || '',
    item.bookName || item.book_name || '',
    item.submittedAt || item.submitted_at || new Date().toISOString(),
    item.status || 'pending',
    item.lastCheckedAt || item.last_checked_at || new Date().toISOString(),
    item.totalImages || item.total_images || 0,
    item.errorMessage || item.error_message || '',
  ];

  sheet.appendRow(rowData);
  return { success: true, rowIndex: sheet.getLastRow() };
}

/**
 * Cập nhật trạng thái batch job trong sheet "batch_jobs" theo batchId
 */
function updateBatchJob(batchId, updateFields) {
  if (!batchId) {
    throw new Error('batchId is required');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (!sheet) {
    return { success: false, error: 'batch_jobs sheet not found' };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: false, error: 'No batch jobs found' };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, BATCH_JOBS_HEADERS.length).getValues();
  let targetRowIndex = -1;

  for (let i = 0; i < data.length; i++) {
    if ((data[i][0] || '').toString() === batchId.toString()) {
      targetRowIndex = i + 2;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, error: 'Batch job not found for batchId: ' + batchId };
  }

  const cur = sheet.getRange(targetRowIndex, 1, 1, BATCH_JOBS_HEADERS.length).getValues()[0];
  const updatedRow = [
    updateFields.batchId !== undefined ? updateFields.batchId : cur[0],
    updateFields.bookName !== undefined ? updateFields.bookName : cur[1],
    updateFields.submittedAt !== undefined ? updateFields.submittedAt : cur[2],
    updateFields.status !== undefined ? updateFields.status : cur[3],
    updateFields.lastCheckedAt !== undefined ? updateFields.lastCheckedAt : cur[4],
    updateFields.totalImages !== undefined ? updateFields.totalImages : cur[5],
    updateFields.errorMessage !== undefined ? updateFields.errorMessage : cur[6],
  ];

  sheet.getRange(targetRowIndex, 1, 1, BATCH_JOBS_HEADERS.length).setValues([updatedRow]);
  return { success: true, rowIndex: targetRowIndex };
}
