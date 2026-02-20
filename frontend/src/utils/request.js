import { ElMessage } from 'element-plus'
import router from '../router'

export async function request(url, options = {}) {
    // 自动携带 Token
    const token = localStorage.getItem('authToken')
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    }
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    try {
        const response = await fetch(url, { ...options, headers })
        const data = await response.json()

        // 处理 401 未登录或 Token 过期
        if (response.status === 401) {
            ElMessage.error('登录已过期，请重新登录')
            localStorage.removeItem('authToken')
            localStorage.removeItem('userInfo')
            router.push('/login')
            throw new Error('Unauthorized')
        }

        // 处理其他报错
        if (!response.ok) {
            ElMessage.error(data.error || data.message || '请求失败')
            throw new Error(data.error || '请求失败')
        }

        return data
    } catch (error) {
        console.error('API Request Error:', error)
        throw error
    }
}