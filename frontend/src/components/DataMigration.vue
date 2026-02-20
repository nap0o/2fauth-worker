<template>
  <div class="migration-container">
    <el-row :gutter="30">
      
      <el-col :xs="24" :md="10" style="margin-bottom: 20px;">
        <el-card class="action-card export-card" shadow="hover">
          <template #header>
            <div class="card-header"><el-icon><Upload /></el-icon> <span>数据导出</span></div>
          </template>
          <div class="card-body">
            <el-alert title="🛡️ 极密保护" type="warning" description="为保护您的资产，所有导出数据必须强制加密！" show-icon :closable="false" style="margin-bottom: 20px;" />
            <p class="desc">将当前金库中的所有账号打包，并使用您设置的密码进行 AES-GCM 强加密。</p>
            <el-button type="warning" size="large" class="full-btn" @click="showExportDialog = true">
              <el-icon><Lock /></el-icon> 设置密码并导出
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="14">
        <el-card class="action-card import-card" shadow="hover">
          <template #header>
            <div class="card-header"><el-icon><Download /></el-icon> <span>数据导入</span></div>
          </template>
          <div class="card-body">
            <p class="desc">支持从各类 2FA 软件或本系统的备份文件中恢复数据。导入时会自动跳过已存在的重复账号。</p>
            <div class="import-options">
              <el-button plain @click="triggerImport('encrypted', '.json')">🔒 本系统加密备份 (.json)</el-button>
              <el-button plain @click="triggerImport('json', '.json')">📄 标准 JSON / 2FAuth (.json)</el-button>
              <el-button plain @click="triggerImport('2fas', '.2fas,.json')">📱 2FAS 备份 (.2fas)</el-button>
              <el-button plain @click="triggerImport('text', '.txt')">📝 纯文本 URI (.txt)</el-button>
            </div>
            <input type="file" ref="fileInputRef" :accept="acceptType" style="display: none" @change="handleFileUpload" />
          </div>
        </el-card>
      </el-col>

    </el-row>

    <el-dialog v-model="showExportDialog" title="设置导出密码" width="400px" destroy-on-close>
      <el-form :model="exportForm" label-position="top" v-loading="isExporting" :element-loading-text="loadingText">
        <el-form-item label="加密密码 (至少 12 位)">
          <el-input v-model="exportForm.password" type="password" show-password placeholder="请输入高强度密码" />
        </el-form-item>
        <el-form-item label="确认密码">
          <el-input v-model="exportForm.confirm" type="password" show-password placeholder="请再次输入" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExportDialog = false">取消</el-button>
        <el-button type="warning" :loading="isExporting" @click="handleExport">开始加密并下载</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDecryptDialog" title="🔓 解密备份文件" width="400px" destroy-on-close>
      <el-alert title="检测到加密文件" type="success" :closable="false" style="margin-bottom: 15px;" />
      <el-form label-position="top" v-loading="isImporting" :element-loading-text="loadingText">
        <el-form-item label="请输入该备份的解密密码：">
          <el-input v-model="importPassword" type="password" show-password placeholder="输入当时设置的导出密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDecryptDialog = false">取消</el-button>
        <el-button type="primary" :loading="isImporting" @click="submitImportData">确认解密并导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Download, Lock } from '@element-plus/icons-vue'
import { request } from '../utils/request'

// 告诉老爸组件 (Home.vue) 导入成功了，赶紧刷新列表
const emit = defineEmits(['import-success'])

// 导出相关状态
const showExportDialog = ref(false)
const isExporting = ref(false)
const exportForm = ref({ password: '', confirm: '' })
const loadingText = ref('')

// 导入相关状态
const fileInputRef = ref(null)
const acceptType = ref('.json')
const currentImportType = ref('')
const currentFileContent = ref('')
const showDecryptDialog = ref(false)
const importPassword = ref('')
const isImporting = ref(false)

// ==========================================
// 1. 导出逻辑
// ==========================================
const handleExport = async () => {
  if (exportForm.value.password !== exportForm.value.confirm) {
    return ElMessage.error('两次输入的密码不一致！')
  }
  if (exportForm.value.password.length < 12) {
    return ElMessage.error('密码太弱！至少需要 12 个字符。')
  }

  loadingText.value = '正在进行高强度 AES-GCM 加密...'
  isExporting.value = true
  try {
    const data = await request('/api/accounts/export-secure', {
      method: 'POST',
      body: JSON.stringify({ password: exportForm.value.password })
    })
    
    // 纯前端触发文件下载
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `2fa-backup-encrypted-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    ElMessage.success('🎉 加密备份导出成功！请妥善保管好您的密码！')
    showExportDialog.value = false
    exportForm.value = { password: '', confirm: '' }
  } catch (error) {
    // 错误已被 request 拦截器处理
  } finally {
    isExporting.value = false
  }
}

// ==========================================
// 2. 导入逻辑
// ==========================================
const triggerImport = (type, accept) => {
  currentImportType.value = type
  acceptType.value = accept
  // 必须用 setTimeout 等待 DOM 更新 accept 属性后再点击
  setTimeout(() => fileInputRef.value.click(), 0)
}

const handleFileUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('文件太大，不能超过 10MB')
    e.target.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (event) => {
    currentFileContent.value = event.target.result
    
    if (currentImportType.value === 'encrypted') {
      // 如果是加密导入，弹出密码框
      importPassword.value = ''
      showDecryptDialog.value = true
    } else {
      // 否则直接发送给后端
      submitImportData()
    }
  }
  reader.onerror = () => ElMessage.error('文件读取失败')
  reader.readAsText(file)
  e.target.value = '' // 清空，允许重复上传
}

const submitImportData = async () => {
  if (currentImportType.value === 'encrypted' && !importPassword.value) {
    return ElMessage.warning('请输入解密密码')
  }

  loadingText.value = '正在解密并导入数据...'
  isImporting.value = true
  try {
    const data = await request('/api/accounts/import', {
      method: 'POST',
      body: JSON.stringify({
        type: currentImportType.value,
        content: currentFileContent.value,
        password: importPassword.value
      })
    })

    if (data.success) {
      let msg = `✅ 成功导入 ${data.count} 个账户！`
      if (data.duplicates > 0) msg += ` (自动跳过了 ${data.duplicates} 个重复账户)`
      ElMessage.success({ message: msg, duration: 5000 })
      
      showDecryptDialog.value = false
      emit('import-success') // 通知 Home.vue 刷新列表并切回 Tab
    }
  } catch (error) {
  } finally {
    isImporting.value = false
  }
}
</script>

<style scoped>
.migration-container {
  padding: 10px 0;
}

.action-card {
  height: 100%;
  border-radius: 12px;
  border: none;
}

.card-header {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.desc {
  color: #606266;
  margin-bottom: 25px;
  line-height: 1.6;
}

.full-btn {
  width: 100%;
  border-radius: 8px;
  margin-top: auto;
}

.import-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-top: auto;
}

.import-options .el-button {
  margin: 0;
  justify-content: flex-start;
  padding-left: 20px;
}

@media (max-width: 768px) {
  .import-options {
    grid-template-columns: 1fr;
  }
}
</style>