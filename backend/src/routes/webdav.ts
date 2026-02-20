import { Hono } from 'hono';
import { createClient } from 'webdav';
import { EnvBindings, AppError, SECURITY_CONFIG } from '../config';
import { authMiddleware, sanitizeInput } from '../utils/helper';
import { encryptData, decryptData } from '../utils/crypto';

const webdav = new Hono<{ Bindings: EnvBindings, Variables: { user: any } }>();

// 🛡️ 挂载鉴权中间件
webdav.use('*', authMiddleware);

// 辅助：加密单个字段并序列化为字符串存储
async function encryptField(data: any, key: string) {
    const encrypted = await encryptData(data, key);
    return JSON.stringify(encrypted);
}

// 辅助：反序列化并解密单个字段
async function decryptField(encryptedStr: string, key: string) {
    try {
        const encryptedObj = JSON.parse(encryptedStr);
        return await decryptData(encryptedObj, key);
    } catch (e) {
        console.error('Decryption failed', e);
        return null;
    }
}

// 内部辅助：创建 WebDAV 客户端
function getWebDavClient(config: any) {
    if (!config || !config.url || !config.username || !config.password) {
        throw new AppError('WebDAV configuration is incomplete', 400);
    }
    return createClient(config.url, {
        username: config.username,
        password: config.password
    });
}

// 内部辅助：生成备份文件名
function generateBackupFilename(dir: string) {
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const cleanDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    return `${cleanDir}/2fa-backup-${date}.json`;
}

// ==========================================
// 1. 获取 WebDAV 配置 (解密后返回给前端)
// ==========================================
webdav.get('/configs', async (c) => {
    const { results } = await c.env.DB.prepare("SELECT * FROM webdav_configs LIMIT 1").all();
    if (results.length === 0) return c.json({ success: true, configs: [] });

    const row: any = results[0];
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const password = await decryptField(row.password, key);

    // 🚀 [自动迁移] 升级 WebDAV 密码加密格式
    try {
        const raw = JSON.parse(row.password);
        if (raw.salt && raw.salt.length > 0) {
            const newPass = await encryptField(password, key);
            c.executionCtx.waitUntil(
                c.env.DB.prepare("UPDATE webdav_configs SET password = ? WHERE id = ?").bind(newPass, row.id).run()
            );
        }
    } catch (e) {}

    const configs = [{
        url: row.url,
        username: row.username,
        password: password,
        saveDir: row.save_dir
    }];
    return c.json({ success: true, configs });
});

// ==========================================
// 2. 保存 WebDAV 配置 (加密后存入 KV)
// ==========================================
webdav.post('/configs', async (c) => {
    const { configs } = await c.req.json();
    
    if (!Array.isArray(configs)) {
        throw new AppError('Invalid format: configs must be an array', 400);
    }

    const config = configs[0];
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const passwordEncrypted = await encryptField(config.password, key);

    await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM webdav_configs"),
        c.env.DB.prepare("INSERT INTO webdav_configs (url, username, password, save_dir, updated_at) VALUES (?, ?, ?, ?, ?)").bind(config.url, config.username, passwordEncrypted, config.saveDir, Date.now())
    ]);
    
    return c.json({ success: true, message: 'Configuration saved securely' });
});

// ==========================================
// 3. 测试连接 (示例桩代码)
// ==========================================
webdav.post('/test', async (c) => {
    // 前端通常会把当前填写的配置传过来测试，所以这里直接用 body 里的
    const config = await c.req.json();
    
    try {
        const client = getWebDavClient(config);
        // 尝试读取根目录来验证凭证
        await client.getDirectoryContents('/');
        return c.json({ success: true, message: 'Connection successful' });
    } catch (error: any) {
        console.error('WebDAV Test Error:', error);
        throw new AppError(`Connection failed: ${error.message}`, 400);
    }
});

// ==========================================
// 4. 获取备份文件列表
// ==========================================
webdav.post('/list', async (c) => {
    const { results } = await c.env.DB.prepare("SELECT * FROM webdav_configs LIMIT 1").all();
    if (results.length === 0) throw new AppError('No WebDAV config found', 404);

    const row: any = results[0];
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const password = await decryptField(row.password, key);

    // 🚀 [自动迁移] 升级 WebDAV 密码加密格式 (在 list 接口也做检查)
    try {
        const raw = JSON.parse(row.password);
        if (raw.salt && raw.salt.length > 0) {
            const newPass = await encryptField(password, key);
            c.executionCtx.waitUntil(
                c.env.DB.prepare("UPDATE webdav_configs SET password = ? WHERE id = ?").bind(newPass, row.id).run()
            );
        }
    } catch (e) {}

    const configs = [{
        url: row.url,
        username: row.username,
        password: password,
        saveDir: row.save_dir || '/'
    }];

    if (configs.length === 0) throw new AppError('No WebDAV config found', 404);
    
    // 默认使用第一个配置
    const config = configs[0];
    const client = getWebDavClient(config);
    
    try {
        const items = await client.getDirectoryContents(config.saveDir);
        // 过滤出我们的备份文件
        const backups = (items as any[])
            .filter(item => item.type === 'file' && item.basename.startsWith('2fa-backup-') && item.basename.endsWith('.json'))
            .map(item => {
                // 尝试获取时间：优先用服务器返回的 lastmod，如果没有则尝试从文件名解析 (文件名包含 ISO 时间戳)
                let displayTime = item.lastmod;
                if (!displayTime) {
                    try {
                        // 文件名格式: 2fa-backup-2024-03-20T10-00-00-000Z.json
                        // 简单提取中间的时间部分用于显示
                        const match = item.basename.match(/2fa-backup-(.+)\.json/);
                        if (match) displayTime = match[1].replace(/-/g, ':').replace('T', ' '); 
                    } catch (e) {}
                }

                return {
                name: item.basename,
                filename: item.basename, // 兼容前端可能使用的 filename 字段
                size: item.size,
                lastMod: displayTime,
                lastModified: displayTime // 兼容前端可能使用的 lastModified 字段
            };
            })
            .sort((a, b) => b.name.localeCompare(a.name)); // 按时间倒序

        return c.json({ success: true, backups });
    } catch (error: any) {
        throw new AppError(`Failed to list backups: ${error.message}`, 500);
    }
});

// ==========================================
// 5. 导出当前金库到 WebDAV
// ==========================================
webdav.post('/export', async (c) => {
    const { password } = await c.req.json();
    if (!password || password.length < SECURITY_CONFIG.MIN_EXPORT_PASSWORD_LENGTH) {
        throw new AppError(`导出密码至少需要 ${SECURITY_CONFIG.MIN_EXPORT_PASSWORD_LENGTH} 个字符`, 400);
    }

    // 获取 WebDAV 配置
    const { results: configResults } = await c.env.DB.prepare("SELECT * FROM webdav_configs LIMIT 1").all();
    if (configResults.length === 0) throw new AppError('No WebDAV config found', 404);
    const configRow: any = configResults[0];
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const webdavPassword = await decryptField(configRow.password, key);
    const webdavConfig = { url: configRow.url, username: configRow.username, password: webdavPassword, saveDir: configRow.save_dir || '/' };

    // 1. 从 D1 获取并解密当前数据
    const { results: accountResults } = await c.env.DB.prepare("SELECT * FROM accounts").all();
    
    const accounts = await Promise.all(accountResults.map(async (row: any) => ({
        service: row.service,
        account: row.account,
        category: row.category,
        secret: await decryptField(row.secret, key),
        digits: row.digits,
        period: row.period
    })));

    // 2. 准备导出数据结构 (清洗数据，仅保留必要字段)
    const exportPayload = {
        version: "2.0",
        app: "2fa-secure-manager",
        encrypted: true,
        timestamp: new Date().toISOString(),
        accounts: accounts.map((acc: any) => ({
            service: acc.service, category: acc.category, account: acc.account,
            secret: acc.secret, digits: acc.digits, period: acc.period
        }))
    };

    // 3. 使用用户密码重新加密
    const userEncrypted = await encryptData(exportPayload, password);
    const fileContent = JSON.stringify({ ...exportPayload, data: userEncrypted, accounts: undefined });

    // 4. 上传到 WebDAV
    const client = getWebDavClient(webdavConfig);
    const filename = generateBackupFilename(webdavConfig.saveDir);
    
    // 尝试创建目录（如果不存在）
    if (webdavConfig.saveDir !== '/' && await client.exists(webdavConfig.saveDir) === false) {
        await client.createDirectory(webdavConfig.saveDir);
    }
    
    await client.putFileContents(filename, fileContent);
    
    return c.json({ success: true, message: 'Backup uploaded successfully', filename });
});

// ==========================================
// 6. 从 WebDAV 恢复备份
// ==========================================
webdav.post('/restore', async (c) => {
    let body;
    try {
        body = await c.req.json();
    } catch (e) {
        throw new AppError('Invalid JSON body', 400);
    }

    // 规范化参数
    const filename = body.filename || body.name;
    const password = body.password;

    if (!filename) throw new AppError('Filename is required', 400);
    if (!password) throw new AppError('Decryption password is required', 400);

    const { results: configResults } = await c.env.DB.prepare("SELECT * FROM webdav_configs LIMIT 1").all();
    if (configResults.length === 0) throw new AppError('No WebDAV config found', 404);
    const configRow: any = configResults[0];
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const webdavPassword = await decryptField(configRow.password, key);
    const saveDir = configRow.save_dir || '/';

    const client = getWebDavClient({ url: configRow.url, username: configRow.username, password: webdavPassword });
    
    // 1. 下载文件
    // 拼接完整路径，因为 filename 只是文件名
    const fullPath = saveDir.endsWith('/') ? `${saveDir}${filename}` : `${saveDir}/${filename}`;
    const content = await client.getFileContents(fullPath, { format: 'text' });
    
    // 2. 使用用户密码解密
    let accounts = [];
    try {
        const backupFile = JSON.parse(content as string);
        // 兼容性检查：如果是旧版直接上传的 KV 数据（没有 data 字段），则无法用密码解密，直接报错
        if (!backupFile.data) throw new Error('Legacy format');
        
        const decrypted = await decryptData(backupFile.data, password);
        accounts = decrypted.accounts || [];
    } catch (e) {
        throw new AppError('解密失败：密码错误或文件格式不兼容', 400);
    }

    // 3. 覆盖写入 D1 (先清空，再批量插入)
    await c.env.DB.prepare("DELETE FROM accounts").run();
    
    const stmt = c.env.DB.prepare(
        `INSERT INTO accounts (id, service, account, category, secret, digits, period, created_at, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const batch = [];
    for (const acc of accounts) {
        const secretEncrypted = await encryptField(acc.secret, key);
        batch.push(stmt.bind(
            crypto.randomUUID(), sanitizeInput(acc.service, 50), sanitizeInput(acc.account, 100),
            acc.category || '', secretEncrypted, acc.digits || 6, acc.period || 30, Date.now(), 'restore'
        ));
    }
    if (batch.length > 0) await c.env.DB.batch(batch);
    
    return c.json({ success: true, message: 'Restore successful' });
});

export default webdav;