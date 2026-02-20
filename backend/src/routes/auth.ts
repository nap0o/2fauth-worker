import { Hono } from 'hono';
import { EnvBindings, AppError } from '../config';
import { generateSecureJWT } from '../utils/crypto';

const auth = new Hono<{ Bindings: EnvBindings }>();

// 内部辅助函数：获取 GitHub 用户信息
async function fetchGitHubUser(accessToken: string, oauthBaseUrl: string) {
    const isGitHub = oauthBaseUrl.includes('github.com');
    const url = isGitHub ? 'https://api.github.com/user' : `${oauthBaseUrl}/api/user`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `token ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': '2FA-Manager-Backend/1.0'
        }
    });
    
    if (!response.ok) {
        throw new AppError(`GitHub API error: ${response.status}`, 502);
    }
    return await response.json();
}

// ==========================================
// 1. 获取授权地址 (前端调用此接口获取跳转链接)
// ==========================================
auth.get('/authorize', async (c) => {
    const state = crypto.randomUUID();
    const env = c.env;
    const isGitHub = env.OAUTH_BASE_URL.includes('github.com');
    const authPath = isGitHub ? '/login/oauth/authorize' : '/oauth2/authorize';
    
    const params = new URLSearchParams({
        client_id: env.OAUTH_CLIENT_ID,
        redirect_uri: env.OAUTH_REDIRECT_URI, // 注意：后续在环境变量中，这里要填入 Vue 前端的地址
        state: state,
        scope: isGitHub ? 'read:user user:email' : 'openid profile email'
    });

    const authUrl = `${env.OAUTH_BASE_URL.replace(/\/$/, '')}${authPath}?${params}`;

    // 返回 URL 和 State 让 Vue 前端存入 localStorage 后自行跳转
    return c.json({ success: true, authUrl, state });
});

// ==========================================
// 2. 核心逻辑：用 Code 换取系统的 JWT 令牌
// ==========================================
auth.post('/callback', async (c) => {
    const { code } = await c.req.json();
    const env = c.env;

    if (!code) {
        throw new AppError('Missing OAuth code', 400);
    }

    const isGitHub = env.OAUTH_BASE_URL.includes('github.com');
    const tokenPath = isGitHub ? '/login/oauth/access_token' : '/oauth2/token';

    // 去 GitHub 换取 Access Token
    const tokenResponse = await fetch(`${env.OAUTH_BASE_URL.replace(/\/$/, '')}${tokenPath}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': '2FA-Manager-Backend/1.0'
        },
        body: new URLSearchParams({
            client_id: env.OAUTH_CLIENT_ID,
            client_secret: env.OAUTH_CLIENT_SECRET,
            code: code,
            redirect_uri: env.OAUTH_REDIRECT_URI,
        })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
        throw new AppError('Failed to exchange code for token', 502);
    }

    // 获取用户信息
    const userData = await fetchGitHubUser(tokenData.access_token, env.OAUTH_BASE_URL);

    // 严密的安全校验：比对 OAUTH_ID (改为比对用户名)
    // GitHub API 返回的用户名在 login 字段，这里统一转小写比较以防大小写差异
    const currentUsername = userData.login || userData.username;
    if (!currentUsername || currentUsername.toLowerCase() !== env.OAUTH_ID.toLowerCase()) {
        throw new AppError('Unauthorized user', 403);
    }

    // 签发我们系统的专属 JWT 令牌
    const payload = {
        userInfo: {
            id: userData.id,
            username: userData.login || userData.username || 'GitHub User',
            email: userData.email,
            avatar_template: userData.avatar_url || userData.avatar_template
        }
    };

    const token = await generateSecureJWT(payload, env.JWT_SECRET);

    return c.json({
        success: true,
        token,
        userInfo: payload.userInfo
    });
});

export default auth;