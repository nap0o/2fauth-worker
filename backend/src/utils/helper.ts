import { Context, Next } from 'hono';
import { SECURITY_CONFIG, AppError, EnvBindings } from '../config';
import { verifySecureJWT } from './crypto';

// 1. 输入净化与验证
export function sanitizeInput(input: any, maxLength = SECURITY_CONFIG.MAX_INPUT_LENGTH): string {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>"'&\x00-\x1F\x7F]/g, '').trim().substring(0, maxLength);
}

export function validateBase32Secret(secret: any): boolean {
    if (!secret || typeof secret !== 'string') return false;
    const cleaned = secret.replace(/\s/g, '').toUpperCase();
    return /^[A-Z2-7]+=*$/.test(cleaned) && cleaned.length >= 16;
}

export function validateServiceName(service: any): boolean {
    const cleaned = sanitizeInput(service, 50);
    return cleaned.length >= 1 && cleaned.length <= 50;
}

export function validateAccountName(account: any): boolean {
    const cleaned = sanitizeInput(account, 100);
    return cleaned.length >= 1 && cleaned.length <= 100;
}

// 2. 解析 二维码 URI
export function parseOTPAuthURI(uri: string) {
    try {
        if (!uri || typeof uri !== 'string' || uri.length > 1000) return null;
        const url = new URL(uri);
        if (url.protocol !== 'otpauth:') return null;
        
        const type = url.hostname;
        if (type !== 'totp' && type !== 'hotp') return null;
        
        const label = decodeURIComponent(url.pathname.substring(1));
        const params = new URLSearchParams(url.search);
        
        const secret = params.get('secret');
        if (!validateBase32Secret(secret)) return null;
        
        const [issuer, account] = label.includes(':') ? label.split(':', 2) : ['', label];
        const digits = parseInt(params.get('digits') || '6');
        const period = parseInt(params.get('period') || '30');
        
        if (digits < 6 || digits > 8 || period < 15 || period > 300) return null;
        
        return {
            type, 
            label: sanitizeInput(label, 100), 
            issuer: sanitizeInput(params.get('issuer') || issuer, 50),
            account: sanitizeInput(account || label, 100), 
            secret: secret!, 
            algorithm: (params.get('algorithm') || 'SHA1').toUpperCase(),
            digits, 
            period
        };
    } catch { 
        return null; 
    }
}

// 3. Hono JWT 鉴权中间件
export async function authMiddleware(c: Context<{ Bindings: EnvBindings, Variables: { user: any } }>, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Unauthorized: Missing or invalid token', 401);
    }
    
    const token = authHeader.substring(7);
    const payload = await verifySecureJWT(token, c.env.JWT_SECRET);
    
    if (!payload || !payload.userInfo) {
        throw new AppError('Unauthorized: Token expired or invalid', 401);
    }
    
    // 验证通过，将用户信息挂载到上下文，供后续路由使用
    c.set('user', payload.userInfo);
    await next();
}