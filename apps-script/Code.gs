/**
 * GOOGLE APPS SCRIPT BRIDGE FOR DOCKER OCR (Schema Động & Hỗ trợ Quản lý Sách)
 *
 * Cấu trúc cột Sheet 1 (Khớp chính xác với thứ tự của bạn):
 * [ fileName | status | driveFileId | ocrText | errorMessage | bookName | batchId | batchRequestKey | note ]
 *
 * Sheet 2 (Tên: batch_jobs):
 * [ batchId | bookName | submittedAt | status | lastCheckedAt | totalImages | errorMessage ]
 *
 * Hướng dẫn thiết lập:
 * 1. Mở file Google Sheet của bạn.
 * 2. Chọn Tiện ích mở rộng (Extensions) > Apps Script.
 * 3. Dán toàn bộ mã nguồn này vào file Code.gs.
 * 4. Vào Cài đặt dự án (Project Settings ⚙️) > Script Properties:
 *    - Key: SECRET_TOKEN
 *    - Value: <nhập token bí mật do bạn tự đặt>
 * 5. Bấm Triển khai (Deploy) > Quản lý bản triển khai (Manage deployments) > Chỉnh sửa > Phiên bản mới (New version) > Triển khai.
 */

const MAIN_SHEET_HEADERS = [
  'fileName',
  'status',
  'driveFileId',
  'ocrText',
  'errorMessage',
  'bookName',
  'batchId',
  'batchRequestKey',
  'note',
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

function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
  const isConfigured = Boolean(token);

  return jsonResponse({
    status: 'ok',
    message: 'Google Apps Script Bridge cho Docker OCR đang hoạt động!',
    secretTokenConfigured: isConfigured,
    mainSchema: MAIN_SHEET_HEADERS,
    batchJobsSchema: BATCH_JOBS_HEADERS,
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
      case 'appendRows':
        return jsonResponse(appendRows(body.data || body.items || body.rows));
      case 'updateRow':
        return jsonResponse(
          updateRow(body.driveFileId || body.hash || body.batchRequestKey, body.data),
        );
      case 'batchUpdateRows':
        return jsonResponse(batchUpdateRows(body.updates));
      case 'updateRowsByBatchId':
        return jsonResponse(updateRowsByBatchId(body.batchId, body.data));
      case 'deleteBookRows':
        return jsonResponse(deleteBookRows(body.bookName));
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
 * Trợ giúp lấy bảng ánh xạ tên cột -> chỉ số cột (0-based) dựa vào dòng 1
 */
function getColumnIndexMap(sheet, defaultHeaders) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    const map = {};
    for (let i = 0; i < defaultHeaders.length; i++) {
      map[defaultHeaders[i]] = i;
    }
    return { map: map, totalCols: defaultHeaders.length };
  }

  const headerRow = sheet
    .getRange(1, 1, 1, Math.max(lastCol, defaultHeaders.length))
    .getValues()[0];
  const map = {};

  for (let c = 0; c < headerRow.length; c++) {
    const h = (headerRow[c] || '').toString().trim();
    if (h) {
      map[h] = c;
    }
  }

  // Nếu thiếu cột nào trong defaultHeaders, map vào vị trí kế tiếp
  let nextIdx = headerRow.length;
  for (let d = 0; d < defaultHeaders.length; d++) {
    const dh = defaultHeaders[d];
    if (map[dh] === undefined) {
      map[dh] = nextIdx++;
    }
  }

  return { map: map, totalCols: Math.max(lastCol, nextIdx) };
}

/**
 * Đảm bảo header và sheet phụ tồn tại
 */
function ensureHeader() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheets()[0];

  const lastRow = mainSheet.getLastRow();
  const lastCol = mainSheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    mainSheet.appendRow(MAIN_SHEET_HEADERS);
  } else {
    const currentHeaders = mainSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const existingSet = new Set(
      currentHeaders.map(function (s) {
        return s.trim();
      }),
    );
    const missing = MAIN_SHEET_HEADERS.filter(function (h) {
      return !existingSet.has(h);
    });

    if (missing.length > 0) {
      mainSheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    }
  }

  let batchSheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (!batchSheet) {
    batchSheet = ss.insertSheet(BATCH_JOBS_SHEET_NAME);
    batchSheet.appendRow(BATCH_JOBS_HEADERS);
  } else if (batchSheet.getLastRow() === 0) {
    batchSheet.appendRow(BATCH_JOBS_HEADERS);
  }

  return {
    success: true,
    message: 'Headers and sheets verified',
    mainSheetHeaders: MAIN_SHEET_HEADERS,
    batchJobsHeaders: BATCH_JOBS_HEADERS,
  };
}

/**
 * Quét danh sách file ảnh trong Google Drive (tự động nhận subfolder = tên sách)
 */
function listImages(folderId) {
  if (!folderId) throw new Error('folderId is required');

  const rootFolder = DriveApp.getFolderById(folderId);
  const result = [];

  function collectFromFolder(folder, bookName) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();

      if (mimeType && mimeType.indexOf('image/') === 0) {
        result.push({
          id: file.getId(),
          name: file.getName(),
          createdTime: file.getDateCreated().toISOString(),
          mimeType: mimeType,
          bookName: bookName || 'Default',
        });
      }
    }
  }

  // 1. Quét file lẻ trong thư mục gốc
  collectFromFolder(rootFolder, rootFolder.getName());

  // 2. Quét các subfolders (mỗi subfolder = 1 cuốn sách)
  const subfolders = rootFolder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    collectFromFolder(subfolder, subfolder.getName());
  }

  return { success: true, folderName: rootFolder.getName(), files: result };
}

/**
 * Tải ảnh và mã hoá Base64
 */
function getImageBase64(fileId) {
  if (!fileId) throw new Error('fileId is required');

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
 * Đọc tất cả dòng dữ liệu theo Header Động
 */
function readSheetRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return { success: true, records: [] };

  const { map, totalCols } = getColumnIndexMap(sheet, MAIN_SHEET_HEADERS);
  const data = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues();
  const records = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rec = {
      fileName: (row[map.fileName] || '').toString(),
      status: (row[map.status] || 'pending').toString(),
      driveFileId: (row[map.driveFileId] || '').toString(),
      ocrText: (row[map.ocrText] || '').toString(),
      errorMessage: (row[map.errorMessage] || '').toString(),
      bookName: (row[map.bookName] || 'Default').toString(),
      batchId: (row[map.batchId] || '').toString(),
      batchRequestKey: (row[map.batchRequestKey] || '').toString(),
      note: (row[map.note] || '').toString(),
      rowIndex: i + 2,
    };
    records.push(rec);
  }

  return { success: true, records: records };
}

/**
 * Thêm dòng mới theo Header Động
 */
function appendRow(item) {
  if (!item) throw new Error('data object is required');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const { map, totalCols } = getColumnIndexMap(sheet, MAIN_SHEET_HEADERS);

  const rowData = new Array(totalCols).fill('');
  rowData[map.fileName] = item.fileName || item.file_name || '';
  rowData[map.status] = item.status || 'pending';
  rowData[map.driveFileId] = item.driveFileId || item.file_id || '';
  rowData[map.ocrText] = item.ocrText || item.ocr_text || '';
  rowData[map.errorMessage] = item.errorMessage || item.error_message || '';
  rowData[map.bookName] = item.bookName || item.book_name || 'Default';
  rowData[map.batchId] = item.batchId || item.batch_id || '';
  rowData[map.batchRequestKey] = item.batchRequestKey || item.batch_request_key || '';
  rowData[map.note] = item.note || '';

  sheet.appendRow(rowData);
  return { success: true, rowIndex: sheet.getLastRow() };
}

/**
 * Thêm hàng loạt nhiều dòng vào Sheet cùng một lúc (Batch Insert cực nhanh trong 1 API call)
 */
function appendRows(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: true, count: 0 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const { map, totalCols } = getColumnIndexMap(sheet, MAIN_SHEET_HEADERS);

  const rowsData = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowData = new Array(totalCols).fill('');
    rowData[map.fileName] = item.fileName || item.file_name || '';
    rowData[map.status] = item.status || 'pending';
    rowData[map.driveFileId] = item.driveFileId || item.file_id || '';
    rowData[map.ocrText] = item.ocrText || item.ocr_text || '';
    rowData[map.errorMessage] = item.errorMessage || item.error_message || '';
    rowData[map.bookName] = item.bookName || item.book_name || 'Default';
    rowData[map.batchId] = item.batchId || item.batch_id || '';
    rowData[map.batchRequestKey] = item.batchRequestKey || item.batch_request_key || '';
    rowData[map.note] = item.note || '';
    rowsData.push(rowData);
  }

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rowsData.length, totalCols).setValues(rowsData);

  return { success: true, count: rowsData.length, startRow: lastRow + 1 };
}

/**
 * Cập nhật 1 dòng theo driveFileId / note / batchRequestKey
 */
function updateRow(identifier, updateFields) {
  if (!identifier) throw new Error('identifier is required');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'Sheet has no data rows' };

  const { map, totalCols } = getColumnIndexMap(sheet, MAIN_SHEET_HEADERS);
  const allValues = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues();
  let targetRowIndex = -1;

  for (let i = 0; i < allValues.length; i++) {
    const driveId = (allValues[i][map.driveFileId] || '').toString();
    const batchKey = (allValues[i][map.batchRequestKey] || '').toString();
    const noteVal = (allValues[i][map.note] || '').toString();
    const fileName = (allValues[i][map.fileName] || '').toString();

    if (
      driveId === identifier.toString() ||
      batchKey === identifier.toString() ||
      noteVal === identifier.toString() ||
      fileName === identifier.toString()
    ) {
      targetRowIndex = i + 2;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, error: 'Row not found for: ' + identifier };
  }

  const currentRow = sheet.getRange(targetRowIndex, 1, 1, totalCols).getValues()[0];
  if (updateFields.fileName !== undefined) currentRow[map.fileName] = updateFields.fileName;
  if (updateFields.status !== undefined) currentRow[map.status] = updateFields.status;
  if (updateFields.driveFileId !== undefined)
    currentRow[map.driveFileId] = updateFields.driveFileId;
  if (updateFields.ocrText !== undefined) currentRow[map.ocrText] = updateFields.ocrText;
  if (updateFields.errorMessage !== undefined)
    currentRow[map.errorMessage] = updateFields.errorMessage;
  if (updateFields.bookName !== undefined) currentRow[map.bookName] = updateFields.bookName;
  if (updateFields.batchId !== undefined) currentRow[map.batchId] = updateFields.batchId;
  if (updateFields.batchRequestKey !== undefined)
    currentRow[map.batchRequestKey] = updateFields.batchRequestKey;
  if (updateFields.note !== undefined) currentRow[map.note] = updateFields.note;

  sheet.getRange(targetRowIndex, 1, 1, totalCols).setValues([currentRow]);
  return { success: true, rowIndex: targetRowIndex };
}

/**
 * Cập nhật hàng loạt nhiều dòng
 */
function batchUpdateRows(updates) {
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return { success: true, updatedCount: 0 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'Sheet has no data rows' };

  const { map, totalCols } = getColumnIndexMap(sheet, MAIN_SHEET_HEADERS);
  const allValues = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues();

  const mapKeyToRow = new Map();
  for (let i = 0; i < allValues.length; i++) {
    const driveId = (allValues[i][map.driveFileId] || '').toString();
    const batchKey = (allValues[i][map.batchRequestKey] || '').toString();
    const fileName = (allValues[i][map.fileName] || '').toString();

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

      if (patch.fileName !== undefined) cur[map.fileName] = patch.fileName;
      if (patch.status !== undefined) cur[map.status] = patch.status;
      if (patch.driveFileId !== undefined) cur[map.driveFileId] = patch.driveFileId;
      if (patch.ocrText !== undefined) cur[map.ocrText] = patch.ocrText;
      if (patch.errorMessage !== undefined) cur[map.errorMessage] = patch.errorMessage;
      if (patch.bookName !== undefined) cur[map.bookName] = patch.bookName;
      if (patch.batchId !== undefined) cur[map.batchId] = patch.batchId;
      if (patch.batchRequestKey !== undefined) cur[map.batchRequestKey] = patch.batchRequestKey;
      if (patch.note !== undefined) cur[map.note] = patch.note;

      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    sheet.getRange(2, 1, lastRow - 1, totalCols).setValues(allValues);
  }

  return { success: true, updatedCount: updatedCount };
}

/**
 * Cập nhật dòng theo batchId
 */
function updateRowsByBatchId(batchId, updateFields) {
  if (!batchId) throw new Error('batchId is required');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, updatedCount: 0 };

  const { map, totalCols } = getColumnIndexMap(sheet, MAIN_SHEET_HEADERS);
  const allValues = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues();
  let updatedCount = 0;

  for (let i = 0; i < allValues.length; i++) {
    const rowBatchId = (allValues[i][map.batchId] || '').toString();
    if (rowBatchId === batchId.toString()) {
      if (updateFields.status !== undefined) allValues[i][map.status] = updateFields.status;
      if (updateFields.errorMessage !== undefined)
        allValues[i][map.errorMessage] = updateFields.errorMessage;
      if (updateFields.ocrText !== undefined) allValues[i][map.ocrText] = updateFields.ocrText;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    sheet.getRange(2, 1, lastRow - 1, totalCols).setValues(allValues);
  }

  return { success: true, updatedCount: updatedCount };
}

/**
 * Xóa toàn bộ các dòng của một cuốn sách (bookName) khỏi Sheet 1 và batch_jobs
 */
function deleteBookRows(bookName) {
  if (!bookName) throw new Error('bookName is required');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = ss.getSheets()[0];
  const lastRow = mainSheet.getLastRow();
  let deletedCount = 0;

  if (lastRow > 1) {
    const { map, totalCols } = getColumnIndexMap(mainSheet, MAIN_SHEET_HEADERS);
    const allValues = mainSheet.getRange(2, 1, lastRow - 1, totalCols).getValues();
    const remainingRows = [];

    for (let i = 0; i < allValues.length; i++) {
      const rowBookName = (allValues[i][map.bookName] || 'Default').toString();
      if (rowBookName !== bookName.toString()) {
        remainingRows.push(allValues[i]);
      } else {
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      // Xóa toàn bộ dữ liệu từ dòng 2 trở đi
      mainSheet.getRange(2, 1, lastRow - 1, totalCols).clearContent();
      if (remainingRows.length > 0) {
        mainSheet.getRange(2, 1, remainingRows.length, totalCols).setValues(remainingRows);
      }
    }
  }

  // Xóa các job liên quan trong batch_jobs sheet
  const batchSheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (batchSheet) {
    const bLastRow = batchSheet.getLastRow();
    if (bLastRow > 1) {
      const bValues = batchSheet
        .getRange(2, 1, bLastRow - 1, BATCH_JOBS_HEADERS.length)
        .getValues();
      const remainingJobs = [];
      let bDeleted = 0;
      for (let j = 0; j < bValues.length; j++) {
        if ((bValues[j][1] || '').toString() !== bookName.toString()) {
          remainingJobs.push(bValues[j]);
        } else {
          bDeleted++;
        }
      }
      if (bDeleted > 0) {
        batchSheet.getRange(2, 1, bLastRow - 1, BATCH_JOBS_HEADERS.length).clearContent();
        if (remainingJobs.length > 0) {
          batchSheet
            .getRange(2, 1, remainingJobs.length, BATCH_JOBS_HEADERS.length)
            .setValues(remainingJobs);
        }
      }
    }
  }

  return { success: true, deletedCount: deletedCount, bookName: bookName };
}

/**
 * Đọc tất cả dòng từ sheet batch_jobs
 */
function readBatchJobs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (!sheet) return { success: true, records: [] };

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, records: [] };

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
 * Thêm 1 dòng vào sheet batch_jobs
 */
function appendBatchJob(item) {
  if (!item) throw new Error('batch job data is required');

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
 * Cập nhật dòng trong sheet batch_jobs
 */
function updateBatchJob(batchId, updateFields) {
  if (!batchId) throw new Error('batchId is required');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BATCH_JOBS_SHEET_NAME);
  if (!sheet) return { success: false, error: 'batch_jobs sheet not found' };

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'No batch jobs found' };

  const data = sheet.getRange(2, 1, lastRow - 1, BATCH_JOBS_HEADERS.length).getValues();
  let targetRowIndex = -1;

  for (let i = 0; i < data.length; i++) {
    if ((data[i][0] || '').toString() === batchId.toString()) {
      targetRowIndex = i + 2;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, error: 'Batch job not found for: ' + batchId };
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
