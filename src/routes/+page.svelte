<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import StatsCards from '$lib/components/StatsCards.svelte';
  import SetupStatusCard from '$lib/components/SetupStatusCard.svelte';
  import SyncActionPanel from '$lib/components/SyncActionPanel.svelte';
  import BooksOverviewCard from '$lib/components/BooksOverviewCard.svelte';
  import BatchJobsTable from '$lib/components/BatchJobsTable.svelte';
  import FileTable from '$lib/components/FileTable.svelte';
  import OcrPreviewModal from '$lib/components/OcrPreviewModal.svelte';
  import PromptEditorModal from '$lib/components/PromptEditorModal.svelte';
  import CustomDialogModal from '$lib/components/CustomDialogModal.svelte';
  import LogConsole from '$lib/components/LogConsole.svelte';
  import type { SystemStatusResponse } from '$lib/types/status.js';
  import type { SheetRecord } from '$lib/types/ocr.js';
  import type { SetupCheckResult } from '$lib/types/config.js';
  import type { DialogOptions } from '$lib/types/modal.js';

  let statusData = $state<SystemStatusResponse>({
    isConfigured: false,
    missingEnv: [],
    pollIntervalMinutes: 5,
    maxConcurrency: 3,
    outputDir: './output',
    geminiModel: 'gemini-3.5-flash-lite',
    availableModels: [],
    driveFolderId: '',
    appscriptWebAppUrl: '',
    hasAppscriptSecret: false,
    hasGeminiKey: false,
    useBatchMode: true,
    batchWaitBeforeSubmitMinutes: 10,
    batchPollIntervalMinutes: 20,
    batchMaxImagesPerJob: 300,
    isSyncing: false,
    lastSyncSummary: null,
    lastSyncTime: null,
    lastSetupCheck: null,
    records: [],
    batchJobs: [],
    recentLogs: [],
  });

  let isRefreshing = $state(false);
  let isRunningCheck = $state(false);
  let isSyncing = $state(false);
  let isScanningDrive = $state(false);
  let isPollingBatches = $state(false);
  let isPromptEditorOpen = $state(false);
  let selectedRecord = $state<SheetRecord | null>(null);
  let processingFileId = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let dialog = $state<DialogOptions>({
    isOpen: false,
    variant: 'info',
    title: '',
    message: '',
    bullets: [],
    confirmText: 'Đã hiểu',
    cancelText: 'Hủy bỏ',
  });

  function showInfoModal(title: string, message: string, bullets?: string[]) {
    dialog = {
      isOpen: true,
      variant: 'info',
      title,
      message,
      bullets,
      confirmText: 'Đã hiểu',
    };
  }

  function showSuccessModal(title: string, message: string, bullets?: string[]) {
    dialog = {
      isOpen: true,
      variant: 'success',
      title,
      message,
      bullets,
      confirmText: 'Đã hiểu',
    };
  }

  function showErrorModal(title: string, message: string, bullets?: string[]) {
    dialog = {
      isOpen: true,
      variant: 'error',
      title,
      message,
      bullets,
      confirmText: 'Đóng',
    };
  }

  function showConfirmModal(
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    confirmText = 'Xác nhận xóa',
    cancelText = 'Hủy bỏ',
  ) {
    dialog = {
      isOpen: true,
      variant: 'confirm',
      title,
      message,
      confirmText,
      cancelText,
      onConfirm,
    };
  }

  async function fetchStatus() {
    isRefreshing = true;
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        statusData = await res.json();
      }
    } catch {
      // ignore network hiccups
    } finally {
      isRefreshing = false;
    }
  }

  async function handleScanDrive() {
    isScanningDrive = true;
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { discovered: number; total: number; books: string[] };
        await fetchStatus();
        showSuccessModal('Đã quét xong Google Drive!', 'Đã đồng bộ danh sách ảnh từ Drive vào Sheet dạng Pending.', [
          `Tổng số ảnh trên Google Drive: ${data.total}`,
          `Ảnh mới nạp vào Sheet: ${data.discovered}`,
          `Danh sách sách: ${data.books.join(', ') || 'Default'}`,
        ]);
      } else {
        const err = (await res.json()) as { error?: string };
        showErrorModal('Lỗi khi quét Google Drive', err.error || 'Thao tác không thành công.');
      }
    } catch (err: unknown) {
      showErrorModal('Lỗi khi quét Google Drive', err instanceof Error ? err.message : String(err));
    } finally {
      isScanningDrive = false;
    }
  }

  async function handleModelChange(newModel: string) {
    statusData.geminiModel = newModel;
    try {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel }),
      });
      await fetchStatus();
    } catch {
      // ignore
    }
  }

  async function handleRunSetupCheck() {
    isRunningCheck = true;
    try {
      const res = await fetch('/api/setup-check', { method: 'POST' });
      if (res.ok) {
        const result: SetupCheckResult = await res.json();
        statusData.lastSetupCheck = result;
      }
      await fetchStatus();
    } finally {
      isRunningCheck = false;
    }
  }

  async function handleRunSync() {
    isSyncing = true;
    try {
      const action = statusData.useBatchMode ? 'submit' : 'sync';
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await fetchStatus();
    } finally {
      isSyncing = false;
    }
  }

  async function handleRunBookBatch(bookName: string) {
    isSyncing = true;
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(bookName)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        showErrorModal('Lỗi khi gửi Batch Job', err.error || `Không thể gửi batch cho cuốn ${bookName}`);
      }
      await fetchStatus();
    } catch (err: unknown) {
      showErrorModal('Lỗi khi gửi Batch Job', err instanceof Error ? err.message : String(err));
    } finally {
      isSyncing = false;
    }
  }

  async function handleDownloadBookZip(bookName: string) {
    await handleExportMarkdown(bookName);
  }

  async function handleDeleteBook(bookName: string) {
    showConfirmModal(
      'Xác nhận xóa cuốn sách',
      `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của cuốn sách "${bookName}" khỏi Sheet 1 và danh sách batch_jobs không? Thao tác này sẽ xóa vĩnh viễn các dòng trên Google Sheet.`,
      async () => {
        try {
          const res = await fetch(`/api/books/${encodeURIComponent(bookName)}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            const data = (await res.json()) as { deletedCount: number };
            await fetchStatus();
            showSuccessModal('Đã xóa thành công', `Đã xóa ${data.deletedCount} dòng của cuốn "${bookName}".`);
          } else {
            const err = (await res.json()) as { error?: string };
            showErrorModal('Lỗi khi xóa', err.error || 'Thao tác không thành công');
          }
        } catch (err: unknown) {
          showErrorModal('Lỗi khi xóa', err instanceof Error ? err.message : String(err));
        }
      },
      'Xóa dữ liệu',
      'Hủy bỏ',
    );
  }

  async function handlePollBatches() {
    isPollingBatches = true;
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll' }),
      });
      await fetchStatus();
    } finally {
      isPollingBatches = false;
    }
  }

  async function handleExportMarkdown(targetBook?: string) {
    try {
      const url = targetBook ? `/api/export?book=${encodeURIComponent(targetBook)}` : '/api/export';
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({ error: 'Không thể xuất ZIP' }))) as { error?: string };
        throw new Error(errorData.error || 'Lỗi khi xuất file ZIP');
      }

      const count = res.headers.get('X-Exported-Count') || '0';
      if (parseInt(count, 10) === 0) {
        showInfoModal(
          'Chưa có dữ liệu xuất',
          targetBook
            ? `Chưa có trang nào của cuốn "${targetBook}" hoàn thành OCR để xuất ZIP.`
            : 'Chưa có trang nào hoàn thành OCR để xuất ZIP.',
        );
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      let filename = targetBook ? `ocr-${targetBook}.zip` : 'ocr-markdown-pages.zip';
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: unknown) {
      showErrorModal('Lỗi khi tải ZIP Markdown', err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRunSingleOcr(fileId: string) {
    processingFileId = fileId;
    try {
      const res = await fetch(`/api/files/${fileId}/ocr`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { record: SheetRecord };
        if (selectedRecord && selectedRecord.driveFileId === fileId) {
          selectedRecord = data.record;
        }
      }
      await fetchStatus();
    } finally {
      processingFileId = null;
    }
  }

  onMount(() => {
    fetchStatus();
    pollTimer = setInterval(fetchStatus, 4000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>

<Header
  {isRefreshing}
  onRefresh={fetchStatus}
  onOpenPromptEditor={() => (isPromptEditorOpen = true)}
/>

<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 w-full flex-1">
  <StatsCards records={statusData.records} />

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <SetupStatusCard
      isConfigured={statusData.isConfigured}
      missingEnv={statusData.missingEnv}
      setupResult={statusData.lastSetupCheck}
      {isRunningCheck}
      onRunSetupCheck={handleRunSetupCheck}
    />

    <SyncActionPanel
      isSyncing={isSyncing || statusData.isSyncing}
      isScanning={isScanningDrive}
      lastSyncSummary={statusData.lastSyncSummary}
      lastSyncTime={statusData.lastSyncTime}
      pollIntervalMinutes={statusData.pollIntervalMinutes}
      maxConcurrency={statusData.maxConcurrency}
      geminiModel={statusData.geminiModel}
      availableModels={statusData.availableModels}
      useBatchMode={statusData.useBatchMode}
      batchPollIntervalMinutes={statusData.batchPollIntervalMinutes}
      isPolling={isPollingBatches}
      onModelChange={handleModelChange}
      onScanDrive={handleScanDrive}
      onRunSync={handleRunSync}
      onPollBatches={handlePollBatches}
      onExportMarkdown={() => handleExportMarkdown()}
    />
  </div>

  <BooksOverviewCard
    records={statusData.records}
    isSyncing={isSyncing}
    onRunBookBatch={handleRunBookBatch}
    onDownloadBookZip={handleDownloadBookZip}
    onDeleteBook={handleDeleteBook}
  />

  {#if statusData.useBatchMode || (statusData.batchJobs && statusData.batchJobs.length > 0)}
    <BatchJobsTable
      batchJobs={statusData.batchJobs}
      onPollBatches={handlePollBatches}
      isPolling={isPollingBatches}
    />
  {/if}

  <FileTable
    records={statusData.records}
    onSelectRecord={(rec) => (selectedRecord = rec)}
    onRunSingleOcr={handleRunSingleOcr}
    {processingFileId}
  />

  <LogConsole logs={statusData.recentLogs} />
</main>

<OcrPreviewModal
  record={selectedRecord}
  onClose={() => (selectedRecord = null)}
  onRunSingleOcr={handleRunSingleOcr}
  isProcessing={processingFileId === selectedRecord?.driveFileId}
/>

<PromptEditorModal
  isOpen={isPromptEditorOpen}
  onClose={() => (isPromptEditorOpen = false)}
/>

<CustomDialogModal
  {dialog}
  onClose={() => (dialog.isOpen = false)}
/>

