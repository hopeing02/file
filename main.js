// main.js - 완전히 안전한 버전
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

app.whenReady().then(createWindow);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'D드라이브 파일 탐색기',
        show: false
    });

    mainWindow.loadFile('index.html');
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // 보안 경고 숨기기
        mainWindow.webContents.executeJavaScript(`
            const originalWarn = console.warn;
            console.warn = function(...args) {
                if (args[0] && args[0].includes('Electron Security Warning')) {
                    return;
                }
                originalWarn.apply(console, args);
            };
        `);
    });
    
    // F12로 개발자 도구
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
        }
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 경로 정규화
function normalizePath(filePath) {
    if (process.platform === 'win32') {
        return path.normalize(filePath).replace(/\//g, '\\');
    }
    return path.normalize(filePath);
}

// 스킵 파일 체크
function shouldSkipFile(fileName) {
    const skipList = [
        'hiberfil.sys', 'pagefile.sys', 'swapfile.sys', 'bootTel.dat',
        'DumpStack.log', 'DumpStack.log.tmp', '$Recycle.Bin', 
        'System Volume Information', 'Recovery', 'PerfLogs', 
        'WindowsApps', 'Packages', 'Config.Msi'
    ];
    
    return skipList.some(skip => fileName.includes(skip)) || 
           fileName.startsWith('.') || 
           fileName.startsWith('$');
}

// 안전한 파일 스캔 (Promise chain 사용)
function scanDirectorySafe(dirPath, maxItems = 500) {
    return new Promise((resolve) => {
        const results = [];
        let itemCount = 0;
        
        fs.readdir(dirPath, { withFileTypes: true })
            .then(items => {
                const promises = items
                    .filter(item => !shouldSkipFile(item.name))
                    .slice(0, maxItems) // 최대 항목 수 제한
                    .map(item => {
                        const fullPath = normalizePath(path.join(dirPath, item.name));
                        
                        return fs.stat(fullPath)
                            .then(stats => {
                                itemCount++;
                                return {
                                    name: item.name,
                                    path: fullPath,
                                    isDirectory: item.isDirectory(),
                                    size: item.isDirectory() ? 0 : stats.size,
                                    modified: stats.mtime.getTime(), // 숫자로 저장
                                    created: stats.birthtime.getTime() // 숫자로 저장
                                };
                            })
                            .catch(() => null); // 오류 시 null 반환
                    });
                
                return Promise.allSettled(promises);
            })
            .then(results => {
                const validFiles = results
                    .filter(result => result.status === 'fulfilled' && result.value)
                    .map(result => result.value);
                
                console.log(`스캔 완료: ${dirPath} - ${validFiles.length}개 파일`);
                resolve(validFiles);
            })
            .catch(error => {
                console.log(`스캔 실패: ${dirPath} - ${error.message}`);
                resolve([]);
            });
    });
}

// D드라이브 스캔
ipcMain.handle('scan-d-drive', async () => {
    try {
        console.log('D드라이브 스캔 시작');
        const files = await scanDirectorySafe('D:\\');
        return { success: true, files: files };
    } catch (error) {
        console.error('D드라이브 스캔 오류:', error.message);
        return { success: false, error: error.message, files: [] };
    }
});

// 특정 디렉토리 스캔
ipcMain.handle('scan-directory', async (event, dirPath) => {
    try {
        console.log(`디렉토리 스캔 시작: ${dirPath}`);
        const normalizedPath = normalizePath(dirPath);
        const files = await scanDirectorySafe(normalizedPath);
        return { success: true, files: files };
    } catch (error) {
        console.error('디렉토리 스캔 오류:', error.message);
        return { success: false, error: error.message, files: [] };
    }
});

// 파일 열기
ipcMain.handle('open-file', async (event, filePath) => {
    try {
        const { shell } = require('electron');
        const result = await shell.openPath(normalizePath(filePath));
        return { success: result === '' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 폴더 열기
ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
        if (process.platform === 'win32') {
            const { spawn } = require('child_process');
            spawn('explorer', [normalizePath(folderPath)], { detached: true, stdio: 'ignore' });
            return { success: true };
        } else {
            const { shell } = require('electron');
            const result = await shell.openPath(normalizePath(folderPath));
            return { success: result === '' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 폴더에서 보기
ipcMain.handle('show-in-folder', async (event, filePath) => {
    try {
        if (process.platform === 'win32') {
            const { spawn } = require('child_process');
            spawn('explorer', ['/select,', normalizePath(filePath)], { detached: true, stdio: 'ignore' });
            return { success: true };
        } else {
            const { shell } = require('electron');
            shell.showItemInFolder(normalizePath(filePath));
            return { success: true };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 드라이브 목록
ipcMain.handle('get-drives', async () => {
    try {
        if (process.platform === 'win32') {
            const drives = [];
            const drivePromises = [];
            
            for (let i = 65; i <= 90; i++) {
                const drive = String.fromCharCode(i) + ':\\';
                drivePromises.push(
                    fs.access(drive)
                        .then(() => ({ letter: String.fromCharCode(i), path: drive, exists: true }))
                        .catch(() => null)
                );
            }
            
            const results = await Promise.allSettled(drivePromises);
            const validDrives = results
                .filter(result => result.status === 'fulfilled' && result.value)
                .map(result => result.value);
            
            return { success: true, drives: validDrives };
        } else {
            return { success: false, error: 'Windows만 지원됩니다' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 프로세스 종료 시 정리
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});