<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import StatsCards from '$lib/components/StatsCards.svelte';
  import SetupStatusCard from '$lib/components/SetupStatusCard.svelte';
  import SyncActionPanel from '$lib/components/SyncActionPanel.svelte';
  import BatchJobsTable from '$lib/components/BatchJobsTable.svelte';
  import FileTable from '$lib/components/FileTable.svelte';
  import OcrPreviewModal from '$lib/components/OcrPreviewModal.svelte';
  import PromptEditorModal from '$lib/components/PromptEditorModal.svelte';
  import LogConsole from '$lib/components/LogConsole.svelte';
  import type { SystemStatusResponse } from '$lib/types/status.js';
  import type { SheetRecord } from '$lib/types/ocr.js';
  import type { SetupCheckResult } from '$lib/types/config.js';

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
    useBatchMode: false,
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
  let isPollingBatches = $state(false);
  let isPromptEditorOpen = $state(false);
  let selectedRecord = $state<SheetRecord | null>(null);
  let processingFileId = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

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

  async function handleExportMarkdown() {
    try {
      const res = await fetch('/api/export');
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({ error: 'Không thể xuất ZIP' }))) as { error?: string };
        throw new Error(errorData.error || 'Lỗi khi xuất file ZIP');
      }

      const count = res.headers.get('X-Exported-Count') || '0';
      if (parseInt(count, 10) === 0) {
        alert('Chưa có trang nào hoàn thành OCR để xuất ZIP.');
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      let filename = 'ocr-markdown-pages.zip';
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(`Lỗi khi tải ZIP markdown: ${err instanceof Error ? err.message : String(err)}`);
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
  currentModel={statusData.geminiModel}
  availableModels={statusData.availableModels}
  onModelChange={handleModelChange}
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
      lastSyncSummary={statusData.lastSyncSummary}
      lastSyncTime={statusData.lastSyncTime}
      pollIntervalMinutes={statusData.pollIntervalMinutes}
      maxConcurrency={statusData.maxConcurrency}
      outputDir={statusData.outputDir}
      geminiModel={statusData.geminiModel}
      availableModels={statusData.availableModels}
      useBatchMode={statusData.useBatchMode}
      batchPollIntervalMinutes={statusData.batchPollIntervalMinutes}
      isPolling={isPollingBatches}
      onModelChange={handleModelChange}
      onRunSync={handleRunSync}
      onPollBatches={handlePollBatches}
      onExportMarkdown={handleExportMarkdown}
    />
  </div>

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
