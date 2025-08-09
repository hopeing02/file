// preload.js - Enhanced 하이브리드 DB API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 기본 파일 시스템 작업
    scanDDrive: () => ipcRenderer.invoke('scan-d-drive'),
    scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
    openFile: (path) => ipcRenderer.invoke('open-file', path),
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    showInFolder: (path) => ipcRenderer.invoke('show-in-folder', path),
    getDrives: () => ipcRenderer.invoke('get-drives'),
    
    // Enhanced 하이브리드 데이터베이스 작업
    searchFiles: (query) => ipcRenderer.invoke('search-files', query),
    getLatestScan: () => ipcRenderer.invoke('get-latest-scan'),
    getScanHistory: () => ipcRenderer.invoke('get-scan-history'),
    getDbStats: () => ipcRenderer.invoke('get-db-stats'),
    cleanupOldScans: (keepCount) => ipcRenderer.invoke('cleanup-old-scans', keepCount),
    loadScanFiles: (scanId) => ipcRenderer.invoke('load-scan-files', scanId),
    
    // 새로운 기능: 파일 상세 정보
    getFileDetails: (filePath) => ipcRenderer.invoke('get-file-details', filePath),
});

console.log('Electron API with Enhanced Hybrid Database support loaded successfully.');