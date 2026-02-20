<template>
  <div class="webdav-container">
    <el-row :gutter="30">
      
      <el-col :xs="24" :md="10" style="margin-bottom: 20px;">
        <el-card class="config-card" shadow="hover">
          <template #header>
            <div class="card-header" @click="hasConfig ? showConfig = !showConfig : null" :style="{ cursor: hasConfig ? 'pointer' : 'default', justifyContent: 'space-between' }">
              <div style="display: flex; align-items: center; gap: 10px;">
                <el-icon><Setting /></el-icon> <span>WebDAV 配置</span>
              </div>
              <el-icon v-if="hasConfig">
                <ArrowUp v-if="showConfig" />
                <ArrowDown v-else />
              </el-icon>
            </div>
          </template>
          
          <div v-show="showConfig">
          <el-alert title="数据主权" type="info" description="配置您的私有云盘。所有备份上传前均会进行高强度 AES-GCM 加密，即使网盘被攻破，数据也绝对安全。" show-icon :closable="false" style="margin-bottom: 20px;" />

          <el-form :model="config" label-position="top" v-loading="isTesting || isSaving" :element-loading-text="loadingText">
            <el-form-item label="WebDAV 地址">
              <el-input v-model="config.url" placeholder="https://your-server.com/remote.php/webdav/" clearable />
            </el-form-item>
            
            <el-form-item label="用户名">
              <el-input v-model="config.username" placeholder="输入网盘账号" clearable />
            </el-form-item>
            
            <el-form-item label="密码或应用授权码">
              <el-input v-model="config.password" type="password" show-password placeholder="强烈建议使用应用专用密码" />
            </el-form-item>

            <el-form-item label="网盘保存目录">
              <el-input v-model="config.saveDir" placeholder="/2fauth-backups" />
              <div class="form-tip">系统会自动在此目录下创建按日期分类的文件夹</div>
            </el-form-item>

            <div class="action-buttons">
              <el-button type="info" plain :loading="isTesting" @click="testConnection">
                <el-icon><Link /></el-icon> 测试连接
              </el-button>
              <el-button type="primary" :loading="isSaving" @click="saveConfig">
                <el-icon><Select /></el-icon> 保存配置
              </el-button>
            </div>
          </el-form>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="14">
        <el-card class="backup-card" shadow="hover">
          <template #header>
            <div class="card-header" style="justify-content: space-between;">
              <div><el-icon><Cloudy /></el-icon> <span>云端备份库</span></div>
              <el-button type="success" :loading="isExporting" @click="showExportDialog = true" :disabled="!hasConfig">
                <el-icon><Upload /></el-icon> 立即备份到云端
              </el-button>
            </div>
          </template>

          <div v-if="!hasConfig" class="empty-tip">
            <el-empty description="请先在左侧保存 WebDAV 配置" :image-size="100" />
          </div>

          <div v-else>
            <div style="margin-bottom: 15px; display: flex; justify-content: space-between;">
              <span style="font-weight: 600; color: #606266;">云端文件列表</span>
              <el-button size="small" circle @click="loadBackups" :loading="isLoadingList" title="刷新列表">
                <el-icon><Refresh /></el-icon>
              </el-button>
            </div>

            <el-table :data="backupList" v-loading="isLoadingList" style="width: 100%" height="300" empty-text="没有备份文件存在,请先备份.">
              <el-table-column prop="filename" label="文件名" min-width="200" show-overflow-tooltip />
              <el-table-column prop="lastModified" label="修改时间" width="160">
                <template #default="scope">
                  {{ scope.row.lastModified ? new Date(scope.row.lastModified).toLocaleString() : '未知' }}
                </template>
              </el-table-column>
              <el-table-column prop="size" label="大小" width="100">
                <template #default="scope">
                  {{ formatSize(scope.row.size) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right" align="center">
                <template #default="scope">
                  <el-button type="primary" link @click="triggerRestore(scope.row)">恢复</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-col>

    </el-row>

    <el-dialog v-model="showExportDialog" title="设置云端加密密码" width="400px" destroy-on-close>
      <el-alert title="极其重要！" type="error" description="系统不会保存此密码！一旦遗忘，云端的备份将变成一堆无法解密的乱码，神仙难救！" show-icon :closable="false" style="margin-bottom: 20px;" />
      <el-form label-position="top" v-loading="isExporting" :element-loading-text="loadingText">
        <el-form-item label="加密密码 (至少 12 位)">
          <el-input v-model="exportPassword" type="password" show-password placeholder="请输入高强度密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExportDialog = false">取消</el-button>
        <el-button type="success" :loading="isExporting" @click="handleExportToWebDAV">加密并上传</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRestoreDialog" title="🔓 从云端恢复" width="400px" destroy-on-close>
      <el-alert title="高危操作" type="warning" description="恢复成功后，将清空覆盖当前金库里的所有数据！" show-icon :closable="false" style="margin-bottom: 15px;" />
      <el-form label-position="top" v-loading="isRestoring" :element-loading-text="loadingText">
        <el-form-item label="请输入该备份的解密密码：">
          <el-input v-model="restorePassword" type="password" show-password placeholder="输入备份时设置的密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRestoreDialog = false">取消</el-button>
        <el-button type="primary" :loading="isRestoring" @click="handleRestore">确认解密覆盖</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Cloudy, Link, Select, Upload, Refresh, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { request } from '../utils/request'

const emit = defineEmits(['restore-success'])

// 表单与状态
const config = ref({ url: '', username: '', password: '', saveDir: '/2fauth-backups' })
const backupList = ref([])
const hasConfig = computed(() => !!config.value.url && !!config.value.username)

// Loading 状态
const isTesting = ref(false)
const isSaving = ref(false)
const isLoadingList = ref(false)
const isExporting = ref(false)
const isRestoring = ref(false)

// 弹窗状态
const showExportDialog = ref(false)
const exportPassword = ref('')
const showRestoreDialog = ref(false)
const restorePassword = ref('')
const selectedBackupPath = ref('')
const loadingText = ref('')

// 移动端适配与折叠逻辑
const isMobile = ref(window.innerWidth < 768)
const showConfig = ref(true)
const checkMobile = () => { isMobile.value = window.innerWidth < 768 }

// ==========================================
// 1. 初始化拉取配置
// ==========================================
onMounted(async () => {
  window.addEventListener('resize', checkMobile)
  try {
    const data = await request('/api/webdav/configs')
    if (data.success && data.configs && data.configs.length > 0) {
      // 我们目前先只取第一个配置
      config.value = { ...config.value, ...data.configs[0] }
      loadBackups()
      
      // 移动端且有配置时，自动收起，方便用户直接看到下方的备份列表
      if (isMobile.value && hasConfig.value) {
        showConfig.value = false
      }
    }
  } catch (e) { console.error('Load config failed', e) }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})

// ==========================================
// 2. 测试与保存配置
// ==========================================
const testConnection = async () => {
  if (!config.value.url || !config.value.username || !config.value.password) {
    return ElMessage.warning('请填写完整的连接信息')
  }
  loadingText.value = '正在连接 WebDAV 服务器...'
  isTesting.value = true
  try {
    const data = await request('/api/webdav/test', {
      method: 'POST', body: JSON.stringify(config.value)
    })
    if (data.success) ElMessage.success('🚀 测试成功！您的 WebDAV 服务器已连通！')
  } catch (e) {
  } finally { isTesting.value = false }
}

const saveConfig = async () => {
  if (!config.value.url) return ElMessage.warning('配置不能为空')
  loadingText.value = '正在保存配置...'
  isSaving.value = true
  try {
    const data = await request('/api/webdav/configs', {
      method: 'POST', 
      body: JSON.stringify({ configs: [config.value] })
    })
    if (data.success) {
      ElMessage.success('✅ 配置已保存')
      loadBackups()
    }
  } catch (e) {
  } finally { isSaving.value = false }
}

// ==========================================
// 3. 获取云端列表
// ==========================================
const loadBackups = async () => {
  if (!hasConfig.value) return
  isLoadingList.value = true
  try {
    const data = await request('/api/webdav/list', {
      method: 'POST', body: JSON.stringify(config.value)
    })
    if (data.success) {
      backupList.value = data.backups || []
    }
  } catch (e) {
  } finally { isLoadingList.value = false }
}

// ==========================================
// 4. 一键加密上传
// ==========================================
const handleExportToWebDAV = async () => {
  if (exportPassword.value.length < 12) return ElMessage.warning('密码太弱！至少需要 12 位。')
  loadingText.value = '正在加密并上传至云端...'
  isExporting.value = true
  try {
    const data = await request('/api/webdav/export', {
      method: 'POST',
      body: JSON.stringify({ password: exportPassword.value, webdavConfig: config.value })
    })
    if (data.success) {
      ElMessage.success('🎉 备份已加密并安全抵达云端！')
      showExportDialog.value = false
      exportPassword.value = ''
      loadBackups() // 刷新列表
    }
  } catch (e) {
  } finally { isExporting.value = false }
}

// ==========================================
// 5. 恢复数据
// ==========================================
const triggerRestore = (row) => {
  selectedBackupPath.value = row.filename
  restorePassword.value = ''
  showRestoreDialog.value = true
}

const handleRestore = async () => {
  if (!restorePassword.value) return ElMessage.warning('请输入解密密码')
  loadingText.value = '正在下载并解密恢复...'
  isRestoring.value = true
  try {
    const data = await request('/api/webdav/restore', {
      method: 'POST',
      body: JSON.stringify({ filename: selectedBackupPath.value, password: restorePassword.value, webdavConfig: config.value })
    })
    if (data.success) {
      ElMessage.success(`✅ 云端同步完成！数据已恢复。`)
      showRestoreDialog.value = false
      emit('restore-success') // 通知父组件刷新金库
    }
  } catch (e) {
  } finally { isRestoring.value = false }
}

// 工具函数：格式化文件大小
const formatSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<style scoped>
.webdav-container { padding: 10px 0; }
.config-card, .backup-card { height: 100%; border-radius: 12px; border: none; }
.card-header { font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
.form-tip { font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4; }
.action-buttons { display: flex; gap: 15px; margin-top: 25px; }
.empty-tip { padding: 40px 0; }
:deep(.el-table__row) { cursor: pointer; }
</style>