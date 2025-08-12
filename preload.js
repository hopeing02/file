// preload.js - Enhanced 하이브리드 DB API
const { contextBridge, ipcRenderer } = require('electron');

// 메인 프로세스와 렌더러 프로세스 간의 안전한 통신을 위한 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
    // 기본 파일 시스템 작업
    scanDDrive: () => ipcRenderer.invoke('scan-d-drive'),
    scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
    openFile: (path) => ipcRenderer.invoke('open-file', path),
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    showInFolder: (path) => ipcRenderer.invoke('show-in-folder', path),
    getDrives: () => ipcRenderer.invoke('get-drives'),
    
    // 새로운 기능: 폴더 선택 및 데이터베이스 관리
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getDatabaseContent: () => ipcRenderer.invoke('get-database-content'),
    deleteScan: (scanId) => ipcRenderer.invoke('delete-scan', scanId),
    clearDatabase: () => ipcRenderer.invoke('clear-database'),
    
    // Enhanced 하이브리드 데이터베이스 작업
    searchFiles: (query) => ipcRenderer.invoke('search-files', query),
    getLatestScan: () => ipcRenderer.invoke('get-latest-scan'),
    getScanHistory: () => ipcRenderer.invoke('get-scan-history'),
    getDbStats: () => ipcRenderer.invoke('get-db-stats'),
    cleanupOldScans: (keepCount) => ipcRenderer.invoke('cleanup-old-scans', keepCount),
    loadScanFiles: (scanId) => ipcRenderer.invoke('load-scan-files', scanId),
    
    // 파일 상세 정보
    getFileDetails: (filePath) => ipcRenderer.invoke('get-file-details', filePath),
});

console.log('✅ Enhanced Electron API 로드 성공');
console.log('🔧 지원 기능: 폴더 선택, 데이터베이스 관리, 고급 검색');
console.log('📁 새로운 기능: 특정 폴더 스캔, JSON 뷰어, DB 관리');