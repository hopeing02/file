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
// preload.js - Electron 보안 브리지
const { contextBridge, ipcRenderer } = require('electron');

// 메인 프로세스와 렌더러 프로세스 간의 안전한 통신을 위한 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
    // D드라이브 스캔
    scanDDrive: () => ipcRenderer.invoke('scan-d-drive'),
    
    // 특정 디렉토리 스캔
    scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
    
    // 파일 열기
    openFile: (path) => ipcRenderer.invoke('open-file', path),
    
    // 폴더 열기 (탐색기에서)
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    
    // 파일이 있는 폴더에서 보기
    showInFolder: (path) => ipcRenderer.invoke('show-in-folder', path),
    
    // 사용 가능한 드라이브 목록 가져오기
    getDrives: () => ipcRenderer.invoke('get-drives'),
    
    // 파일/폴더 정보 가져오기
    getFileInfo: (path) => ipcRenderer.invoke('get-file-info', path),
    
    // 폴더 내용만 가져오기 (빠른 탐색용)
    getFolderContents: (path) => ipcRenderer.invoke('get-folder-contents', path)
});

// 콘솔에 API 로드 확인 메시지 출력
console.log('Electron API가 성공적으로 로드되었습니다.');

/* ===========================================
preload.js - 보안 브리지
===========================================
 */
// preload.js 내용을 별도 파일로 저장해야 합니다:
const preloadContent = `
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    scanDDrive: () => ipcRenderer.invoke('scan-d-drive'),
    scanDirectory: (path) => ipcRenderer.invoke('scan-directory', path),
    openFile: (path) => ipcRenderer.invoke('open-file', path),
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    getDrives: () => ipcRenderer.invoke('get-drives')
});
`;



// 콘솔에 API 로드 확인 메시지 출력
console.log('Electron API가 성공적으로 로드되었습니다.');
