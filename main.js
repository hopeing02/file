// main.js - Enhanced 파일 탐색기 메인 프로세스
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let fileDB;

// 파일 내용 추출기 클래스
class FileContentExtractor {
    constructor() {
        // 지원되는 텍스트 파일 확장자
        this.textExtensions = new Set([
            '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.css',
            '.json', '.xml', '.yml', '.yaml', '.ini', '.cfg', '.log', '.sql',
            '.py', '.java', '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.go',
            '.sh', '.bat', '.ps1', '.vue', '.svelte', '.scss', '.less'
        ]);
        
        // 부분 지원 파일 (제목만)
        this.titleExtensions = new Set([
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
        ]);
        
        // 최대 파일 크기 (5MB)
        this.maxFileSize = 5 * 1024 * 1024;
        // 최대 내용 길이 (100KB)
        this.maxContentLength = 100 * 1024;
    }

    async extractContent(filePath, fileStats) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const fileName = path.basename(filePath);
            
            // 파일이 너무 큰 경우 스킵
            if (fileStats.size > this.maxFileSize) {
                return { title: fileName, content: '', extractable: false, reason: 'File too large' };
            }

            // 텍스트 파일 처리
            if (this.textExtensions.has(ext)) {
                return await this.extractTextContent(filePath, fileName);
            }
            
            // PDF, Office 파일 처리 (제목만)
            if (this.titleExtensions.has(ext)) {
                return await this.extractDocumentTitle(filePath, fileName);
            }

            // 일반 파일 (파일명만)
            return { title: fileName, content: '', extractable: false, reason: 'Unsupported file type' };
            
        } catch (error) {
            console.warn(`Content extraction failed for ${filePath}: ${error.message}`);
            return { title: path.basename(filePath), content: '', extractable: false, reason: error.message };
        }
    }

    async extractTextContent(filePath, fileName) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const truncatedContent = content.length > this.maxContentLength 
                ? content.substring(0, this.maxContentLength) + '...[truncated]'
                : content;
            
            // 제목 추출 시도
            const title = this.extractTitleFromContent(content, fileName);
            
            return {
                title,
                content: truncatedContent,
                extractable: true,
                contentLength: content.length,
                wordCount: content.split(/\s+/).length
            };
        } catch (error) {
            // 바이너리 파일이거나 인코딩 문제
            if (error.code === 'EISDIR') {
                return { title: fileName, content: '', extractable: false, reason: 'Directory' };
            }
            return { title: fileName, content: '', extractable: false, reason: 'Binary or encoding issue' };
        }
    }

    extractTitleFromContent(content, fileName) {
        const lines = content.split('\n').slice(0, 10); // 첫 10줄만 확인
        
        // HTML title 태그
        const htmlTitle = content.match(/<title>(.*?)<\/title>/i);
        if (htmlTitle) return htmlTitle[1].trim();
        
        // Markdown 제목 (#)
        const mdTitle = lines.find(line => line.trim().startsWith('# '));
        if (mdTitle) return mdTitle.replace(/^#\s*/, '').trim();
        
        // 주석에서 제목 찾기
        const commentTitle = lines.find(line => 
            /\/\/\s*title:|\/\*\s*title:|#\s*title:/i.test(line)
        );
        if (commentTitle) {
            const match = commentTitle.match(/title:\s*(.+)/i);
            if (match) return match[1].trim();
        }
        
        // JSON 파일에서 name, title 필드 찾기
        if (path.extname(fileName).toLowerCase() === '.json') {
            try {
                const json = JSON.parse(content);
                if (json.title) return json.title;
                if (json.name) return json.name;
                if (json.displayName) return json.displayName;
            } catch (e) {
                // JSON 파싱 실패 시 무시
            }
        }
        
        // 첫 번째 비어있지 않은 줄을 제목으로 사용
        const firstLine = lines.find(line => line.trim().length > 0);
        if (firstLine && firstLine.trim().length < 100) {
            return firstLine.trim();
        }
        
        // 기본적으로 파일명 사용
        return fileName;
    }

    async extractDocumentTitle(filePath, fileName) {
        // 실제 구현에서는 pdf-parse, mammoth 등 라이브러리 사용
        // 현재는 파일명 기반으로 추정
        try {
            const stats = await fs.stat(filePath);
            
            // 파일 생성/수정 시간을 기반으로 간단한 메타데이터 추출
            const title = fileName.replace(path.extname(fileName), '');
            
            return {
                title: title,
                content: `Document: ${fileName}\nSize: ${stats.size} bytes\nModified: ${stats.mtime.toISOString()}`,
                extractable: false,
                reason: 'Document parsing not implemented',
                documentType: path.extname(filePath).substring(1).toUpperCase()
            };
        } catch (error) {
            return { title: fileName, content: '', extractable: false, reason: error.message };
        }
    }
}

// Enhanced 하이브리드 파일 DB 클래스
class EnhancedHybridFileDB {
    constructor(appPath) {
        this.dbPath = path.join(appPath, 'enhanced_scan_data.json');
        this.data = { scans: [], files: [] };
        this.indexes = {
            nameIndex: new Map(),
            contentIndex: new Map(),
            titleIndex: new Map(),
            extensionIndex: new Map(),
            pathIndex: new Map(),
            scanIndex: new Map()
        };
        this.contentExtractor = new FileContentExtractor();
        this.loadData();
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            this.data = JSON.parse(data);
            this.buildIndexes();
            console.log(`Enhanced DB 로드 완료: ${this.data.files.length}개 파일, ${this.data.scans.length}개 스캔`);
        } catch (error) {
            console.log('새로운 Enhanced DB 생성');
            await this.saveData();
        }
    }

    buildIndexes() {
        // 모든 인덱스 초기화
        Object.values(this.indexes).forEach(index => index.clear());

        this.data.files.forEach((file, index) => {
            // 파일명 인덱스
            this.indexText(file.name, this.indexes.nameIndex, index);
            
            // 제목 인덱스
            if (file.title && file.title !== file.name) {
                this.indexText(file.title, this.indexes.titleIndex, index);
            }
            
            // 내용 인덱스
            if (file.content) {
                this.indexText(file.content, this.indexes.contentIndex, index);
            }

            // 확장자 인덱스
            const ext = path.extname(file.name).toLowerCase();
            if (ext) {
                if (!this.indexes.extensionIndex.has(ext)) {
                    this.indexes.extensionIndex.set(ext, []);
                }
                this.indexes.extensionIndex.get(ext).push(index);
            }

            // 경로 인덱스
            const pathParts = file.path.toLowerCase().split(path.sep);
            pathParts.forEach(part => {
                if (part && part.length > 2) {
                    if (!this.indexes.pathIndex.has(part)) {
                        this.indexes.pathIndex.set(part, new Set());
                    }
                    this.indexes.pathIndex.get(part).add(index);
                }
            });

            // 스캔 ID 인덱스
            if (!this.indexes.scanIndex.has(file.scanId)) {
                this.indexes.scanIndex.set(file.scanId, []);
            }
            this.indexes.scanIndex.get(file.scanId).push(index);
        });

        console.log(`인덱스 구축 완료: 이름 ${this.indexes.nameIndex.size}, 내용 ${this.indexes.contentIndex.size}, 제목 ${this.indexes.titleIndex.size}`);
    }

    // 텍스트를 단어 단위로 인덱싱
    indexText(text, indexMap, fileIndex) {
        const words = text.toLowerCase()
            .replace(/[^\w\s\uAC00-\uD7A3]/g, ' ') // 한글, 영문, 숫자만 남기고 공백으로 치환
            .split(/\s+/)
            .filter(word => word.length >= 2); // 2글자 이상만

        words.forEach(word => {
            if (!indexMap.has(word)) {
                indexMap.set(word, new Set());
            }
            indexMap.get(word).add(fileIndex);
        });

        // 부분 문자열 인덱싱 (3글자 이상)
        words.forEach(word => {
            if (word.length >= 3) {
                for (let i = 0; i <= word.length - 3; i++) {
                    const substring = word.substring(i, i + 3);
                    if (!indexMap.has(substring)) {
                        indexMap.set(substring, new Set());
                    }
                    indexMap.get(substring).add(fileIndex);
                }
            }
        });
    }

    async saveData() {
        try {
            const tempPath = this.dbPath + '.tmp';
            await fs.writeFile(tempPath, JSON.stringify(this.data, null, 2));
            await fs.rename(tempPath, this.dbPath);
        } catch (error) {
            console.error('Enhanced DB 저장 실패:', error);
        }
    }

    async addScan(drivePath, files) {
        const scanId = Date.now();
        const startTime = Date.now();
        
        console.log(`내용 추출 시작: ${files.length}개 파일`);
        
        // 파일 내용 추출 (병렬 처리, 최대 10개씩)
        const enhancedFiles = [];
        const batchSize = 10;
        
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            const batchPromises = batch.map(async (file) => {
                const fileStats = { size: file.size };
                const contentData = await this.contentExtractor.extractContent(file.path, fileStats);
                
                return {
                    ...file,
                    scanId,
                    extension: path.extname(file.name).toLowerCase(),
                    title: contentData.title,
                    content: contentData.content || '',
                    extractable: contentData.extractable || false,
                    contentLength: contentData.contentLength || 0,
                    wordCount: contentData.wordCount || 0,
                    extractionReason: contentData.reason || '',
                    addedAt: Date.now()
                };
            });
            
            const batchResults = await Promise.allSettled(batchPromises);
            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    enhancedFiles.push(result.value);
                }
            });
            
            // 진행 상황 로그
            console.log(`내용 추출 진행: ${Math.min(i + batchSize, files.length)}/${files.length}`);
        }

        const scan = {
            id: scanId,
            drivePath,
            scanDate: new Date().toISOString(),
            totalFiles: enhancedFiles.filter(f => !f.isDirectory).length,
            totalFolders: enhancedFiles.filter(f => f.isDirectory).length,
            totalSize: enhancedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
            extractableFiles: enhancedFiles.filter(f => f.extractable).length,
            totalContentLength: enhancedFiles.reduce((sum, f) => sum + (f.contentLength || 0), 0),
            scanDuration: 0
        };

        // 같은 드라이브의 기존 파일 제거
        this.data.files = this.data.files.filter(f => 
            !f.path.toLowerCase().startsWith(drivePath.toLowerCase())
        );

        this.data.files = this.data.files.concat(enhancedFiles);
        scan.scanDuration = (Date.now() - startTime) / 1000;
        
        // 기존 같은 드라이브 스캔 제거
        this.data.scans = this.data.scans.filter(s => 
            !s.drivePath.toLowerCase().startsWith(drivePath.toLowerCase())
        );
        this.data.scans.push(scan);

        // 인덱스 재구축
        this.buildIndexes();
        
        // 비동기 저장
        setTimeout(() => this.saveData(), 100);
        
        console.log(`Enhanced 스캔 저장 완료: ${enhancedFiles.length}개 파일, ${scan.extractableFiles}개 내용 추출 (ID: ${scanId})`);
        return scanId;
    }

    searchFiles(query, options = {}) {
        if (!query || query.length < 2) return [];
        
        const results = new Set();
        const queryLower = query.toLowerCase();
        const maxResults = options.limit || 1000;

        // 확장자 검색
        if (queryLower.startsWith('.')) {
            const ext = queryLower;
            if (this.indexes.extensionIndex.has(ext)) {
                this.indexes.extensionIndex.get(ext).forEach(idx => results.add(idx));
            }
        } else {
            // 파일명에서 검색
            this.searchInIndex(queryLower, this.indexes.nameIndex, results);
            
            // 제목에서 검색
            this.searchInIndex(queryLower, this.indexes.titleIndex, results);
            
            // 내용에서 검색
            this.searchInIndex(queryLower, this.indexes.contentIndex, results);

            // 경로에서 검색
            for (const [pathPart, indexes] of this.indexes.pathIndex) {
                if (pathPart.includes(queryLower)) {
                    indexes.forEach(idx => results.add(idx));
                }
            }
        }

        // 결과 정렬 및 반환
        const filteredResults = Array.from(results)
            .map(idx => {
                const file = this.data.files[idx];
                // 검색 관련성 점수 계산
                let relevanceScore = 0;
                
                // 파일명 정확 매치
                if (file.name.toLowerCase() === queryLower) relevanceScore += 100;
                else if (file.name.toLowerCase().includes(queryLower)) relevanceScore += 50;
                
                // 제목 매치
                if (file.title && file.title.toLowerCase().includes(queryLower)) relevanceScore += 30;
                
                // 내용 매치
                if (file.content && file.content.toLowerCase().includes(queryLower)) relevanceScore += 10;
                
                return { ...file, relevanceScore };
            })
            .sort((a, b) => {
                // 관련성 점수로 정렬
                if (a.relevanceScore !== b.relevanceScore) {
                    return b.relevanceScore - a.relevanceScore;
                }
                
                // 폴더 우선
                if (a.isDirectory !== b.isDirectory) {
                    return b.isDirectory - a.isDirectory;
                }
                
                // 이름 순
                return a.name.localeCompare(b.name);
            })
            .slice(0, maxResults);

        console.log(`Enhanced 검색 완료: "${query}" -> ${filteredResults.length}개 결과`);
        return filteredResults;
    }

    searchInIndex(query, indexMap, results) {
        // 완전 단어 매치 우선
        if (indexMap.has(query)) {
            indexMap.get(query).forEach(idx => results.add(idx));
        }
        
        // 부분 매치
        for (const [word, indexes] of indexMap) {
            if (word.includes(query) && word !== query) {
                indexes.forEach(idx => results.add(idx));
            }
        }
    }

    getFilesByScan(scanId) {
        const indexes = this.indexes.scanIndex.get(scanId) || [];
        return indexes.map(idx => this.data.files[idx]);
    }

    getLatestFiles() {
        if (this.data.scans.length === 0) return [];
        
        const latestScan = this.data.scans
            .sort((a, b) => new Date(b.scanDate) - new Date(a.scanDate))[0];
        
        return this.getFilesByScan(latestScan.id);
    }

    getRecentScans(limit = 10) {
        return this.data.scans
            .sort((a, b) => new Date(b.scanDate) - new Date(a.scanDate))
            .slice(0, limit);
    }

    getStats() {
        const extractableFiles = this.data.files.filter(f => f.extractable).length;
        const totalContentLength = this.data.files.reduce((sum, f) => sum + (f.contentLength || 0), 0);
        
        return {
            totalFiles: this.data.files.filter(f => !f.isDirectory).length,
            totalFolders: this.data.files.filter(f => f.isDirectory).length,
            totalScans: this.data.scans.length,
            totalSize: this.data.files.reduce((sum, f) => sum + (f.size || 0), 0),
            extractableFiles: extractableFiles,
            totalContentLength: totalContentLength,
            averageContentLength: extractableFiles > 0 ? Math.round(totalContentLength / extractableFiles) : 0,
            dbSize: JSON.stringify(this.data).length,
            indexStats: {
                nameEntries: this.indexes.nameIndex.size,
                contentEntries: this.indexes.contentIndex.size,
                titleEntries: this.indexes.titleIndex.size,
                extensions: this.indexes.extensionIndex.size,
                paths: this.indexes.pathIndex.size,
                scans: this.indexes.scanIndex.size
            }
        };
    }

    async cleanupOldScans(keepCount = 5) {
        if (this.data.scans.length <= keepCount) return 0;

        const scansToKeep = this.data.scans
            .sort((a, b) => new Date(b.scanDate) - new Date(a.scanDate))
            .slice(0, keepCount);

        const keepIds = new Set(scansToKeep.map(s => s.id));
        
        const oldFileCount = this.data.files.length;
        this.data.files = this.data.files.filter(f => keepIds.has(f.scanId));
        this.data.scans = scansToKeep;

        this.buildIndexes();
        await this.saveData();

        console.log(`Enhanced DB 정리 완료: ${oldFileCount - this.data.files.length}개 파일 제거`);
        return oldFileCount - this.data.files.length;
    }
}

// 앱 초기화
app.whenReady().then(() => {
    initDatabase();
    createWindow();
});

function initDatabase() {
    try {
        const userDataPath = app.getPath('userData');
        fileDB = new EnhancedHybridFileDB(userDataPath);
        console.log('Enhanced 하이브리드 데이터베이스 초기화 완료');
    } catch (error) {
        console.error('Enhanced 데이터베이스 초기화 실패:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'D드라이브 파일 탐색기 Enhanced',
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

// 유틸리티 함수들
function normalizePath(filePath) {
    if (process.platform === 'win32') {
        return path.normalize(filePath).replace(/\//g, '\\');
    }
    return path.normalize(filePath);
}

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

// 안전한 파일 스캔
function scanDirectorySafe(dirPath, maxItems = 1000) {
    return new Promise((resolve) => {
        const results = [];
        
        fs.readdir(dirPath, { withFileTypes: true })
            .then(items => {
                const promises = items
                    .filter(item => !shouldSkipFile(item.name))
                    .slice(0, maxItems)
                    .map(item => {
                        const fullPath = normalizePath(path.join(dirPath, item.name));
                        
                        return fs.stat(fullPath)
                            .then(stats => {
                                return {
                                    name: item.name,
                                    path: fullPath,
                                    isDirectory: item.isDirectory(),
                                    size: item.isDirectory() ? 0 : stats.size,
                                    modified: stats.mtime.getTime(),
                                    created: stats.birthtime.getTime()
                                };
                            })
                            .catch(() => null);
                    });
                
                return Promise.allSettled(promises);
            })
            .then(results => {
                const validFiles = results
                    .filter(result => result.status === 'fulfilled' && result.value)
                    .map(result => result.value);
                
                console.log(`파일 스캔 완료: ${dirPath} - ${validFiles.length}개 항목`);
                resolve(validFiles);
            })
            .catch(error => {
                console.log(`스캔 실패: ${dirPath} - ${error.message}`);
                resolve([]);
            });
    });
}

// IPC 핸들러들
ipcMain.handle('scan-d-drive', async () => {
    return await scanDrive('D:\\');
});

ipcMain.handle('scan-directory', async (event, dirPath) => {
    return await scanDrive(dirPath);
});

// 새로운 기능: 폴더 선택 다이얼로그
ipcMain.handle('select-folder', async () => {
    try {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: '스캔할 폴더를 선택하세요'
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, folderPath: result.filePaths[0] };
        } else {
            return { success: false, error: 'Folder selection cancelled' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// JSON 데이터베이스 전체 내용 가져오기
ipcMain.handle('get-database-content', async () => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const dbContent = {
            scans: fileDB.data.scans,
            files: fileDB.data.files.map(file => ({
                name: file.name,
                path: file.path,
                isDirectory: file.isDirectory,
                size: file.size || 0,
                modified: file.modified,
                created: file.created,
                title: file.title || file.name,
                content: file.content || '',
                extractable: file.extractable || false,
                contentLength: file.contentLength || 0,
                wordCount: file.wordCount || 0,
                extension: file.extension || '',
                scanId: file.scanId,
                addedAt: file.addedAt
            })),
            stats: fileDB.getStats()
        };
        
        return { success: true, data: dbContent };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 특정 스캔 삭제
ipcMain.handle('delete-scan', async (event, scanId) => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        // 스캔과 관련된 파일들 제거
        const beforeCount = fileDB.data.files.length;
        fileDB.data.files = fileDB.data.files.filter(f => f.scanId !== scanId);
        fileDB.data.scans = fileDB.data.scans.filter(s => s.id !== scanId);
        
        const deletedCount = beforeCount - fileDB.data.files.length;
        
        // 인덱스 재구축 및 저장
        fileDB.buildIndexes();
        await fileDB.saveData();
        
        console.log(`스캔 삭제 완료: ID ${scanId}, ${deletedCount}개 파일 제거`);
        return { success: true, deletedCount };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 데이터베이스 초기화
ipcMain.handle('clear-database', async () => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const fileCount = fileDB.data.files.length;
        const scanCount = fileDB.data.scans.length;
        
        fileDB.data.files = [];
        fileDB.data.scans = [];
        fileDB.buildIndexes();
        await fileDB.saveData();
        
        console.log(`데이터베이스 초기화 완료: ${fileCount}개 파일, ${scanCount}개 스캔 제거`);
        return { success: true, deletedFiles: fileCount, deletedScans: scanCount };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

async function scanDrive(drivePath) {
    const startTime = Date.now();
    
    try {
        console.log(`Enhanced 드라이브 스캔 시작: ${drivePath}`);
        
        // 파일 스캔
        const files = await scanDirectorySafe(drivePath);
        
        if (files.length > 0 && fileDB) {
            // 내용 추출 및 데이터베이스에 저장
            const scanId = await fileDB.addScan(drivePath, files);
            
            // 데이터베이스에서 enhanced 파일 정보 가져오기
            const enhancedFiles = fileDB.getFilesByScan(scanId);
            
            // 직렬화 가능한 형태로 변환 (Set, Map 등 제거)
            const serializedFiles = enhancedFiles.map(file => ({
                name: file.name,
                path: file.path,
                isDirectory: file.isDirectory,
                size: file.size || 0,
                modified: file.modified,
                created: file.created,
                // Enhanced 정보들 추가
                title: file.title || file.name,
                content: file.content || '',
                extractable: file.extractable || false,
                contentLength: file.contentLength || 0,
                wordCount: file.wordCount || 0,
                extension: file.extension || '',
                scanId: file.scanId
            }));
            
            const stats = {
                totalFiles: serializedFiles.filter(f => !f.isDirectory).length,
                totalFolders: serializedFiles.filter(f => f.isDirectory).length,
                totalSize: serializedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
                extractableFiles: serializedFiles.filter(f => f.extractable).length,
                duration: (Date.now() - startTime) / 1000
            };
            
            console.log(`Enhanced 스캔 및 저장 완료: ${serializedFiles.length}개 항목, ${stats.duration.toFixed(1)}초`);
            
            return { 
                success: true, 
                files: serializedFiles, // enhanced 파일 정보 포함
                scanId,
                stats
            };
        } else {
            return { 
                success: true, 
                files: [], 
                stats: { duration: (Date.now() - startTime) / 1000 }
            };
        }
    } catch (error) {
        console.error('Enhanced 스캔 실패:', error);
        return { 
            success: false, 
            error: error.message, 
            files: [] 
        };
    }
}

// 데이터베이스 관련 IPC 핸들러들
ipcMain.handle('search-files', async (event, query) => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const startTime = Date.now();
        const searchResults = fileDB.searchFiles(query, { limit: 1000 });
        const searchTime = Date.now() - startTime;
        
        // 직렬화 가능한 형태로 변환
        const serializedResults = searchResults.map(file => ({
            name: file.name,
            path: file.path,
            isDirectory: file.isDirectory,
            size: file.size || 0,
            modified: file.modified,
            created: file.created,
            title: file.title || file.name,
            content: file.content || '',
            extractable: file.extractable || false,
            contentLength: file.contentLength || 0,
            wordCount: file.wordCount || 0,
            extension: file.extension || '',
            relevanceScore: file.relevanceScore || 0,
            scanId: file.scanId
        }));
        
        console.log(`Enhanced 검색 완료: "${query}" - ${serializedResults.length}개 결과, ${searchTime}ms`);
        return { success: true, files: serializedResults, searchTime };
    } catch (error) {
        console.error('Enhanced 검색 실패:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-latest-scan', async () => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const files = fileDB.getLatestFiles();
        
        // 직렬화 가능한 형태로 변환
        const serializedFiles = files.map(file => ({
            name: file.name,
            path: file.path,
            isDirectory: file.isDirectory,
            size: file.size || 0,
            modified: file.modified,
            created: file.created,
            title: file.title || file.name,
            content: file.content || '',
            extractable: file.extractable || false,
            contentLength: file.contentLength || 0,
            wordCount: file.wordCount || 0,
            extension: file.extension || '',
            scanId: file.scanId
        }));
        
        return { success: true, files: serializedFiles };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-scan-history', async () => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const history = fileDB.getRecentScans(20);
        return { success: true, history };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-db-stats', async () => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const stats = fileDB.getStats();
        return { success: true, stats };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('cleanup-old-scans', async (event, keepCount = 5) => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const deletedCount = await fileDB.cleanupOldScans(keepCount);
        return { success: true, deletedCount };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-scan-files', async (event, scanId) => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const files = fileDB.getFilesByScan(scanId);
        
        // 직렬화 가능한 형태로 변환
        const serializedFiles = files.map(file => ({
            name: file.name,
            path: file.path,
            isDirectory: file.isDirectory,
            size: file.size || 0,
            modified: file.modified,
            created: file.created,
            title: file.title || file.name,
            content: file.content || '',
            extractable: file.extractable || false,
            contentLength: file.contentLength || 0,
            wordCount: file.wordCount || 0,
            extension: file.extension || '',
            scanId: file.scanId
        }));
        
        return { success: true, files: serializedFiles };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 파일 상세 정보 조회
ipcMain.handle('get-file-details', async (event, filePath) => {
    try {
        if (!fileDB) return { success: false, error: 'Database not initialized' };
        
        const file = fileDB.data.files.find(f => f.path === filePath);
        if (!file) return { success: false, error: 'File not found in database' };
        
        // 직렬화 가능한 형태로 변환
        const serializedFile = {
            name: file.name,
            path: file.path,
            isDirectory: file.isDirectory,
            size: file.size || 0,
            modified: file.modified,
            created: file.created,
            title: file.title || file.name,
            content: file.content || '',
            extractable: file.extractable || false,
            contentLength: file.contentLength || 0,
            wordCount: file.wordCount || 0,
            extension: file.extension || '',
            extractionReason: file.extractionReason || '',
            scanId: file.scanId
        };
        
        return { success: true, file: serializedFile };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 기존 파일 시스템 IPC 핸들러들
ipcMain.handle('open-file', async (event, filePath) => {
    try {
        const { shell } = require('electron');
        const result = await shell.openPath(normalizePath(filePath));
        return { success: result === '' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

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

// 에러 핸들링
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});
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