<template>
  <header class="header">
    <div class="logo">
      <el-button v-if="layoutState.isMobile && route.path !== '/login'" link @click="layoutState.showMobileMenu = true" style="margin-right: 5px; padding: 0;">
        <el-icon :size="24" color="#606266"><Menu /></el-icon>
      </el-button>
      <el-icon :size="24" color="#409EFC" style="margin-right: 10px;"><Lock /></el-icon>
      <h2>2FAuth</h2>
    </div>
    <div class="user-actions" v-if="route.path !== '/login'">
      <div class="user-profile" v-if="!layoutState.isMobile">
        <el-avatar :size="32" :src="userState.userInfo?.avatar_template" />
        <span class="username">{{ userState.userInfo?.username }}</span>
      </div>
      <el-button type="danger" circle @click="handleLogout" title="退出登录">
        <el-icon><SwitchButton /></el-icon>
      </el-button>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Lock, SwitchButton, Menu } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { layoutState } from '../states/layout'
import { userState } from '../states/user'

const router = useRouter()
const route = useRoute()

const handleLogout = () => {
  userState.clearUserInfo()
  router.push('/login')
  ElMessage.success('已安全退出')
}
</script>

<style scoped>
.header {
  background: white;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 60px;
  flex-shrink: 0; /* 防止被压缩 */
  z-index: 100;
  position: relative;
}

.logo, .user-actions, .user-profile {
  display: flex;
  align-items: center;
}

.logo h2 { margin: 0; color: #303133; font-size: 20px; }
.user-actions { gap: 20px; }
.user-profile { gap: 10px; background: #f0f2f5; padding: 4px 15px 4px 4px; border-radius: 20px; }
.username { font-weight: 600; color: #606266; font-size: 14px; }

@media (max-width: 768px) { .header { padding: 0 15px; } .logo h2 { font-size: 18px; } }
</style>