import { Hono } from 'hono';
import { EnvBindings, AppError, SECURITY_CONFIG } from '../config';
import { authMiddleware, sanitizeInput, validateBase32Secret, validateServiceName, validateAccountName, parseOTPAuthURI } from '../utils/helper';
import { encryptData, decryptData, generateTOTP } from '../utils/crypto';

// 定义带有环境变量和用户变量的 Hono 实例
const accounts = new Hono<{ Bindings: EnvBindings, Variables: { user: any } }>();

// 🛡️ 为这下面所有的路由挂载鉴权中间件 (必须登录才能访问)
accounts.use('*', authMiddleware);

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

// ==========================================
// 1. 获取所有账号
// ==========================================
accounts.get('/', async (c) => {
    const pageStr = c.req.query('page');
    const limitStr = c.req.query('limit');
    const search = c.req.query('search') || '';
    const page = pageStr ? parseInt(pageStr) : 1;
    const limit = limitStr ? parseInt(limitStr) : 50; // 恢复默认 50 条，配合自动迁移策略

    let whereClause = '';
    let params: any[] = [];

    if (search) {
        whereClause = " WHERE (service LIKE ? OR account LIKE ? OR category LIKE ?)";
        const likeTerm = `%${search}%`;
        params.push(likeTerm, likeTerm, likeTerm);
    }

    const countResult = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM accounts${whereClause}`).bind(...params).first();
    const total = countResult?.total as number || 0;

    const query = `SELECT * FROM accounts${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const { results } = await c.env.DB.prepare(query).bind(...params).all();

    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    
    // 并行解密所有账号的 secret
    const accountsList = await Promise.all(results.map(async (row: any) => {
        const secret = await decryptField(row.secret, key);
        
        // 🚀 [自动迁移] 检查是否为旧格式 (含 salt)，如果是则异步升级为极速格式
        try {
            const raw = JSON.parse(row.secret);
            if (raw.salt && raw.salt.length > 0) {
                // 重新加密 (encryptField 现已使用极速模式)
                const newSecret = await encryptField(secret, key);
                // 异步更新数据库 (不阻塞响应)
                c.executionCtx.waitUntil(
                    c.env.DB.prepare("UPDATE accounts SET secret = ? WHERE id = ?")
                        .bind(newSecret, row.id)
                        .run()
                );
            }
        } catch (e) { /* ignore error */ }

        return {
            id: row.id,
            service: row.service,
            account: row.account,
            category: row.category,
            secret: secret || '', // 解密失败则为空
            digits: row.digits,
            period: row.period,
            createdAt: row.created_at
        };
    }));

    const response: any = { success: true, accounts: accountsList };
    
    response.pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
    };

    return c.json(response);
});

// ==========================================
// 2. 添加新账号
// ==========================================
accounts.post('/', async (c) => {
    const { service, category, account, secret, digits = 6, period = 30 } = await c.req.json();
    const user = c.get('user');

    if (!validateServiceName(service) || !validateAccountName(account) || !validateBase32Secret(secret)) {
        throw new AppError('Invalid input format', 400);
    }
    if (![6, 8].includes(digits) || ![30, 60].includes(period)) {
        throw new AppError('Invalid digits or period', 400);
    }

    // D1: 查重
    const existing = await c.env.DB.prepare(
        "SELECT id FROM accounts WHERE service = ? AND account = ?"
    ).bind(service, account).first();
    
    if (existing) throw new AppError('Account already exists', 409);

    const id = crypto.randomUUID();
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const secretEncrypted = await encryptField(secret.replace(/\s/g, '').toUpperCase(), key);

    // D1: 插入
    await c.env.DB.prepare(
        `INSERT INTO accounts (id, service, account, category, secret, digits, period, created_at, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id, sanitizeInput(service, 50), sanitizeInput(account, 100), category ? sanitizeInput(category, 30) : '',
        secretEncrypted, digits, period, Date.now(), user.username
    ).run();

    const newAccount = { id, service, account, category, digits, period };

    return c.json({ success: true, account: { ...newAccount, secret: '[PROTECTED]' } });
});

// ==========================================
// 3. 修改账号信息
// ==========================================
accounts.put('/:id', async (c) => {
    const id = c.req.param('id');
    const { service, category, account, digits, period } = await c.req.json();
    const user = c.get('user');

    if (!validateServiceName(service) || !validateAccountName(account)) {
        throw new AppError('Invalid input format', 400);
    }
    if (digits && ![6, 8].includes(digits)) throw new AppError('Invalid digits', 400);
    if (period && ![30, 60].includes(period)) throw new AppError('Invalid period', 400);

    const result = await c.env.DB.prepare(
        `UPDATE accounts 
         SET service = ?, account = ?, category = ?, digits = COALESCE(?, digits), period = COALESCE(?, period), updated_at = ?, updated_by = ? 
         WHERE id = ?`
    ).bind(
        sanitizeInput(service, 50), sanitizeInput(account, 100), category ? sanitizeInput(category, 30) : '',
        digits || null, period || null, Date.now(), user.username, id
    ).run();

    if (!result.meta.changes) throw new AppError('Account not found', 404);

    return c.json({ success: true, message: 'Account updated successfully' });
});

// ==========================================
// 4. 删除指定账号
// ==========================================
accounts.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const result = await c.env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
    
    if (!result.meta.changes) throw new AppError('Account not found', 404);

    return c.json({ success: true, message: 'Account deleted successfully' });
});

// ==========================================
// 5. 清空所有账号
// ==========================================
accounts.delete('/clear-all', async (c) => {
    await c.env.DB.prepare("DELETE FROM accounts").run();
    return c.json({ success: true, message: 'All accounts cleared' });
});

// ==========================================
// 6. 核心功能：生成 TOTP 验证码
// ==========================================
accounts.post('/generate-totp', async (c) => {
    const { secret, period = 30, digits = 6 } = await c.req.json();
    
    if (!validateBase32Secret(secret)) throw new AppError('Invalid secret format', 400);
    if (![6, 8].includes(digits) || ![30, 60].includes(period)) throw new AppError('Invalid parameters', 400);

    const code = await generateTOTP(secret, period, digits);
    return c.json({ success: true, code });
});

// ==========================================
// 7. 扫码支持：解析 TOTP URI
// ==========================================
accounts.post('/parse-uri', async (c) => {
    const { uri } = await c.req.json();
    if (!uri) throw new AppError('URI is required', 400);

    const account = parseOTPAuthURI(uri);
    if (!account) throw new AppError('Invalid OTP Auth URI', 400);

    return c.json({ success: true, account });
});

// ==========================================
// 8. 从扫码结果添加账户 (修复架构师遗漏的接口)
// ==========================================
accounts.post('/add-from-uri', async (c) => {
    const { uri, category } = await c.req.json();
    const user = c.get('user');

    if (!uri) throw new AppError('URI is required', 400);

    const parsedAccount = parseOTPAuthURI(uri);
    if (!parsedAccount) throw new AppError('Invalid OTP Auth URI', 400);

    // D1: 查重
    const existing = await c.env.DB.prepare(
        "SELECT id FROM accounts WHERE service = ? AND account = ?"
    ).bind(parsedAccount.issuer, parsedAccount.account).first();
    if (existing) throw new AppError('该账号已经存在金库中', 409);

    const id = crypto.randomUUID();
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const secretEncrypted = await encryptField(parsedAccount.secret, key);

    await c.env.DB.prepare(
        `INSERT INTO accounts (id, service, account, category, secret, digits, period, created_at, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id, sanitizeInput(parsedAccount.issuer || 'Unknown', 50), sanitizeInput(parsedAccount.account || 'Unknown', 100),
        category ? sanitizeInput(category, 30) : '', secretEncrypted, parsedAccount.digits, parsedAccount.period, Date.now(), user.username
    ).run();

    const newAccount = { id, service: parsedAccount.issuer, account: parsedAccount.account };

    return c.json({ success: true, account: { ...newAccount, secret: '[PROTECTED]' } });
});

// ==========================================
// 9. 加密导出金库数据
// ==========================================
accounts.post('/export-secure', async (c) => {
    const { password } = await c.req.json();
    if (!password || password.length < SECURITY_CONFIG.MIN_EXPORT_PASSWORD_LENGTH) {
        throw new AppError(`导出密码至少需要 ${SECURITY_CONFIG.MIN_EXPORT_PASSWORD_LENGTH} 个字符`, 400);
    }

    const { results } = await c.env.DB.prepare("SELECT * FROM accounts").all();
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;

    // 解密所有数据以准备导出
    const plainAccounts = await Promise.all(results.map(async (row: any) => ({
        service: row.service,
        account: row.account,
        category: row.category,
        secret: await decryptField(row.secret, key),
        digits: row.digits,
        period: row.period
    })));
    
    // 组装标准导出格式
    const exportData = {
        version: "2.0",
        app: "2fa-secure-manager",
        encrypted: true,
        timestamp: new Date().toISOString(),
        accounts: plainAccounts
    };

    // 使用用户提供的密码进行 AES-GCM 加密
    const encrypted = await encryptData(exportData, password);
    const exportFile = {
        version: "2.0", app: "2fa-secure-manager", encrypted: true,
        timestamp: new Date().toISOString(), data: encrypted,
        note: "This file is encrypted with your export password. Keep it safe!"
    };

    return c.json(exportFile);
});

// ==========================================
// 10. 全能导入通道 (支持 加密/JSON/2FAS/文本)
// ==========================================
accounts.post('/import', async (c) => {
    const { content, type, password } = await c.req.json();
    const user = c.get('user');
    
    if (!content || !type) throw new AppError('内容和类型不能为空', 400);

    let validAccounts: any[] = [];

    try {
        if (type === 'encrypted') {
            if (!password) throw new AppError('加密导入需要密码', 400);
            const encryptedFile = JSON.parse(content);
            const decryptedData = await decryptData(encryptedFile.data, password);
            validAccounts = decryptedData.accounts || [];
        } else if (type === 'json') {
            const data = JSON.parse(content);
            if (data.app && data.app.includes('2fauth') && Array.isArray(data.data)) {
                validAccounts = data.data.map((item: any) => ({...item, category: ''}));
            } else if (data.accounts) {
                validAccounts = data.accounts;
            } else if (Array.isArray(data)) {
                validAccounts = data;
            } else if (data.services) {
                validAccounts = data.services.map((s: any) => ({
                    service: s.service || s.name, account: s.account || s.login,
                    secret: s.secret, digits: s.digits, period: s.period, category: s.group
                }));
            }
        } else if (type === '2fas') {
            const data = JSON.parse(content);
            if (data.services) {
                validAccounts = data.services.map((s: any) => ({
                    service: s.name, account: s.account || s.username,
                    secret: s.secret, digits: s.digits, period: s.period, category: s.category || s.group
                }));
            }
        } else if (type === 'text') {
            const lines = content.split('\n').filter((line: string) => line.trim());
            for (const line of lines) {
                if (line.trim().startsWith('otpauth://')) {
                    const parsed = parseOTPAuthURI(line.trim());
                    if (parsed) validAccounts.push({
                        service: parsed.issuer, account: parsed.account,
                        secret: parsed.secret, digits: parsed.digits, period: parsed.period, category: ''
                    });
                }
            }
        }
    } catch (e) {
        throw new AppError('解析失败，请检查文件格式或密码是否正确', 400);
    }

    // 过滤有效账户并去重保存
    let addedCount = 0;
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;

    // D1 批量插入 (使用事务或批量执行)
    const stmt = c.env.DB.prepare(
        `INSERT INTO accounts (id, service, account, category, secret, digits, period, created_at, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const batch = [];

    for (const acc of validAccounts) {
        if (acc.service && acc.account && validateBase32Secret(acc.secret)) {
            // 简单查重
            const existing = await c.env.DB.prepare("SELECT id FROM accounts WHERE service = ? AND account = ?")
                .bind(acc.service, acc.account).first();
            
            if (!existing) {
                const secretEncrypted = await encryptField(acc.secret.replace(/\s/g, '').toUpperCase(), key);
                batch.push(stmt.bind(
                    crypto.randomUUID(), sanitizeInput(acc.service, 50), sanitizeInput(acc.account, 100),
                    acc.category ? sanitizeInput(acc.category, 30) : '', secretEncrypted,
                    acc.digits || 6, acc.period || 30, Date.now(), user.username
                ));
                addedCount++;
            }
        }
    }

    if (batch.length > 0) await c.env.DB.batch(batch);

    return c.json({ success: true, count: addedCount, total: validAccounts.length, duplicates: validAccounts.length - addedCount });
});

// ==========================================
// 11. 手动触发数据迁移 (旧格式 -> 极速格式)
// ==========================================
accounts.post('/migrate-crypto', async (c) => {
    const key = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;
    const limit = 50; // 每次处理 50 条以防超时

    // D1 JSON 查询：查找仍包含 salt 的记录
    const { results } = await c.env.DB.prepare(
        "SELECT id, secret FROM accounts WHERE json_extract(secret, '$.salt') IS NOT NULL LIMIT ?"
    ).bind(limit).all();

    if (results.length === 0) {
        return c.json({ success: true, message: '所有数据已是最新格式', migrated: 0, remaining: 0 });
    }

    const updates = [];
    for (const row of results) {
        try {
            const plain = await decryptField(row.secret as string, key);
            const newSecret = await encryptField(plain, key);
            updates.push(
                c.env.DB.prepare("UPDATE accounts SET secret = ? WHERE id = ?").bind(newSecret, row.id)
            );
        } catch (e) { console.error(`Failed to migrate account ${row.id}`, e); }
    }

    if (updates.length > 0) await c.env.DB.batch(updates);

    // 检查剩余数量
    const remaining = await c.env.DB.prepare(
        "SELECT COUNT(*) as count FROM accounts WHERE json_extract(secret, '$.salt') IS NOT NULL"
    ).first('count');

    return c.json({ 
        success: true, 
        migrated: updates.length, 
        remaining: remaining,
        message: `已迁移 ${updates.length} 条数据，剩余 ${remaining} 条。请继续点击直到剩余为 0。` 
    });
});

export default accounts;