-- 账号表：每一行存储一个 2FA 凭据
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    service TEXT NOT NULL,
    account TEXT NOT NULL,
    category TEXT,
    secret TEXT NOT NULL, -- 存储加密后的 JSON 字符串 {encrypted, iv, salt}
    digits INTEGER DEFAULT 6,
    period INTEGER DEFAULT 30,
    created_at INTEGER,
    created_by TEXT,
    updated_at INTEGER,
    updated_by TEXT
);

-- WebDAV 配置表
CREATE TABLE IF NOT EXISTS webdav_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL, -- 存储加密后的 JSON 字符串
    save_dir TEXT,
    updated_at INTEGER
);

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_accounts_service ON accounts(service);
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at DESC);