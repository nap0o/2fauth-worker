<template>
  <el-container class="home-container">
    <el-container class="main-body">
      <el-aside width="240px" class="left-aside" v-if="!layoutState.isMobile">
        <el-menu
          :default-active="activeTab"
          class="side-menu"
          @select="handleMenuSelect"
          background-color="#fff"
          text-color="#606266"
          active-text-color="#409EFF"
        >
          <el-menu-item index="accounts">
            <el-icon><Iphone /></el-icon>
            <span>我的账户</span>
          </el-menu-item>

          <el-sub-menu index="tools">
            <template #title>
              <el-icon><Tools /></el-icon><span>实用工具</span>
            </template>
            <el-menu-item index="add-account">添加账号</el-menu-item>
            <el-menu-item index="migration">数据迁移</el-menu-item>
            <el-menu-item index="webdav">数据备份</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-aside>

      <!-- 移动端抽屉菜单 -->
      <el-drawer
        v-model="layoutState.showMobileMenu"
        direction="ltr"
        size="240px"
        :with-header="false"
      >
        <el-menu
          :default-active="activeTab"
          class="side-menu"
          @select="handleMenuSelect"
          style="border-right: none;"
        >
          <el-menu-item index="accounts">
            <el-icon><Iphone /></el-icon>
            <span>我的账户</span>
          </el-menu-item>
          <el-sub-menu index="tools">
            <template #title>
              <el-icon><Tools /></el-icon><span>实用工具</span>
            </template>
            <el-menu-item index="add-account">添加账号</el-menu-item>
            <el-menu-item index="migration">数据迁移</el-menu-item>
            <el-menu-item index="webdav">数据备份</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-drawer>

      <el-main class="main-content">
        <!-- 1. 我的账户视图 -->
        <div v-if="activeTab === 'accounts'" class="view-container">
          <div class="account-list-wrapper" v-loading="loading" element-loading-text="数据加载中..." style="min-height: 400px;">
          <div v-if="!loading && accounts.length === 0 && !searchQuery" class="empty-state">
            <el-empty description="空空如也，快去添加你的第一个 2FA 账号吧！">
              <el-button type="primary" @click="activeTab = 'add-account'">去添加账号</el-button>
            </el-empty>
          </div>

          <div v-else>
          <div class="toolbar" style="margin-bottom: 20px; display: flex; gap: 15px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
            <el-input 
              v-model="searchQuery" 
              placeholder="🔍 搜索服务名称、账号或分类..." 
              clearable 
              style="max-width: 400px; flex: 1;" 
            />
            
            <div class="batch-actions" v-if="selectedIds.length > 0" style="display: flex; align-items: center; gap: 10px;">
              <span style="color: #606266; font-size: 14px;">已选择 {{ selectedIds.length }} 项</span>
              <el-button type="danger" plain @click="handleBulkDelete" :loading="isBulkDeleting">
                <el-icon><Delete /></el-icon> 批量删除
              </el-button>
              <el-button @click="selectedIds = []" plain>取消选择</el-button>
            </div>
            <div v-else>
              <el-button @click="selectAllVisible" plain>全选本页</el-button>
            </div>
          </div>

          <el-row :gutter="20" v-if="accounts.length > 0">
            <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="account in accounts" :key="account.id" style="margin-bottom: 20px;">
              <el-card class="account-card" :class="{ 'is-selected': selectedIds.includes(account.id) }" shadow="hover">
                <div class="card-header">
                  <div class="service-info" style="display: flex; align-items: center; gap: 10px;">
                    <el-checkbox :model-value="selectedIds.includes(account.id)" @change="toggleSelection(account.id)" @click.stop />
                    <h3 class="service-name">{{ account.service }}</h3>
                    <el-tag size="small" v-if="account.category" effect="light">{{ account.category }}</el-tag>
                  </div>
                  
                  <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, account)">
                    <el-icon class="more-icon"><MoreFilled /></el-icon>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="edit">
                          <el-icon><Edit /></el-icon> 编辑账号
                        </el-dropdown-item>
                        <el-dropdown-item command="delete" style="color: #F56C6C;">
                          <el-icon><Delete /></el-icon> 删除账号
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
                
                <p class="account-name" style="margin-left: 24px;">{{ account.account }}</p>
                
                <div class="card-actions">
                  <el-button type="primary" class="code-btn" @click="showTotpCode(account)">
                    <el-icon><Key /></el-icon> 获取验证码
                  </el-button>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <div class="pagination-wrapper" v-if="total > 0" style="margin-top: 10px; display: flex; justify-content: center;">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[12, 24, 48, 96]"
              background
              :layout="layoutState.isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
              :small="layoutState.isMobile"
              :total="total"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
            />
          </div>

          <el-empty v-if="!loading && accounts.length === 0 && searchQuery" description="没有找到匹配的账号" />
          </div>
          </div>
        </div>

        <!-- 2. 添加账号视图 (整合扫码与手动) -->
        <div v-if="activeTab === 'add-account'" class="view-container">
          <div class="tab-card-wrapper">
            <h2 style="text-align: center; margin-bottom: 20px;">添加账号</h2>
            <el-tabs type="border-card" style="max-width: 600px; margin: 0 auto;">
              <el-tab-pane label="📷 扫码添加">
                <div style="text-align: center; margin-bottom: 20px; margin-top: 10px;">
                  <p style="color: #909399;">请允许浏览器使用摄像头，或直接上传微信/系统截图。</p>
                </div>
                <QrScanner @scan-success="handleScanSuccess" />
              </el-tab-pane>
              <el-tab-pane label="⌨️ 手动输入">
                <el-form :model="newAccount" label-position="top" :rules="rules" ref="addFormRef" style="padding: 10px 0;">
                  <el-form-item label="服务名称 (如 Google, GitHub)" prop="service">
                    <el-input v-model="newAccount.service" placeholder="请输入服务名称" />
                  </el-form-item>
                  <el-form-item label="账号标识 (如 邮箱地址)" prop="account">
                    <el-input v-model="newAccount.account" placeholder="请输入账号或邮箱" />
                  </el-form-item>
                  <el-form-item label="安全密钥 (Base32格式)" prop="secret">
                    <el-input v-model="newAccount.secret" placeholder="请输入 16 位以上的安全密钥" />
                  </el-form-item>
                  <el-row :gutter="20">
                    <el-col :span="12">
                      <el-form-item label="代码位数" prop="digits">
                        <el-select v-model="newAccount.digits" style="width: 100%">
                          <el-option label="6 位" :value="6" />
                          <el-option label="8 位" :value="8" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="更新周期" prop="period">
                        <el-select v-model="newAccount.period" style="width: 100%">
                          <el-option label="30 秒" :value="30" />
                          <el-option label="60 秒" :value="60" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-form-item label="分类 (可选)" prop="category">
                    <el-input v-model="newAccount.category" placeholder="如 工作, 个人" />
                  </el-form-item>
                  <el-form-item style="margin-top: 30px;">
                    <el-button type="primary" :loading="submitting" @click="submitAddAccount" style="width: 100%;" size="large">确认添加</el-button>
                  </el-form-item>
                </el-form>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>

        <!-- 3. 数据迁移视图 -->
        <div v-if="activeTab === 'migration'" class="view-container">
          <div class="tab-card-wrapper">
            <div style="text-align: center; margin-bottom: 30px;">
              <h2>数据迁移中心</h2>
              <p style="color: #909399;">安全地备份您的数据，或从其他软件无缝迁移数据。</p>
            </div>
            <DataMigration @import-success="handleImportSuccess" />
          </div>
        </div>

        <!-- 4. WebDAV 备份视图 -->
        <div v-if="activeTab === 'webdav'" class="view-container">
          <div class="tab-card-wrapper">
            <div style="text-align: center; margin-bottom: 30px;">
              <h2>私有云自动备份中心</h2>
              <p style="color: #909399;">将加密数据安全托管至您的个人网盘，永远不用担心手机丢失。</p>
            </div>
            <WebDavConfig @restore-success="handleImportSuccess" />
          </div>
        </div>

      </el-main>
    </el-container>

    <el-dialog v-model="showEditDialog" title="✏️ 编辑账号" :width="layoutState.isMobile ? '90%' : '400px'" destroy-on-close>
      <el-form :model="editAccountData" label-position="top">
        <el-form-item label="服务名称 (如 Google, GitHub)">
          <el-input v-model="editAccountData.service" />
        </el-form-item>
        <el-form-item label="账号标识 (如 邮箱地址)">
          <el-input v-model="editAccountData.account" />
        </el-form-item>
        <el-form-item label="分类 (可选)">
          <el-input v-model="editAccountData.category" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showEditDialog = false">取消</el-button>
          <el-button type="primary" :loading="isEditing" @click="submitEditAccount">保存修改</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- TOTP 验证码弹窗 (新增) -->
    <el-dialog v-model="showTotpDialog" :title="currentTotpAccount?.account" width="300px" center align-center @closed="stopTotpTimer" destroy-on-close>
      <div class="totp-container">
        <div class="totp-service">{{ currentTotpAccount?.service }}</div>
        <div class="totp-code" @click="copyCode">{{ currentTotpCode }}</div>
        <div class="totp-timer">
          <el-progress type="circle" :percentage="totpPercentage" :width="80" :stroke-width="6" :color="totpColor">
            <template #default>
              <span class="timer-text">{{ totpRemaining }}s</span>
            </template>
          </el-progress>
        </div>
        <div class="totp-tip">点击验证码复制</div>
      </div>
    </el-dialog>

  </el-container>
</template>

<script setup>
import { ref, onMounted, computed, watch, h, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Key, MoreFilled, Edit, Delete, Tools, Setting, Iphone } from '@element-plus/icons-vue'
import { request } from '../utils/request'
import { layoutState } from '../states/layout'

import QrScanner from '../components/QrScanner.vue'
import DataMigration from '../components/DataMigration.vue'
import WebDavConfig from '../components/WebDavConfig.vue'

const router = useRouter()
const accounts = ref([])
const loading = ref(true)
const activeTab = ref('accounts') // 默认选中的标签页
const total = ref(0) // 新增：存储服务端返回的总数

// ====== 搜索与分页状态 ======
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(12) // 默认每页显示 12 个（正好排满 3 行）

// 2. 移除客户端分页切片逻辑 (paginatedAccounts)，因为 accounts 现在已经是当前页的数据了
// const paginatedAccounts = computed(() => { ... })

// 3. 分页事件处理
const handleSizeChange = (val) => {
  pageSize.value = val
  currentPage.value = 1 // 切换每页条数时，重置回第一页，防止数据为空
  fetchAccounts()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchAccounts()
}

// 4. 监听搜索词变化：只要用户一打字，就把页码重置回第 1 页
let searchTimer = null
watch(searchQuery, () => {
  currentPage.value = 1
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    fetchAccounts()
  }, 300)
})

// 添加表单相关状态
const submitting = ref(false)
const addFormRef = ref(null)
const newAccount = ref({
  service: '', account: '', secret: '', category: '', digits: 6, period: 30
})

const rules = {
  service: [{ required: true, message: '请输入服务名称', trigger: 'blur' }],
  account: [{ required: true, message: '请输入账号标识', trigger: 'blur' }],
  secret: [
    { required: true, message: '请输入安全密钥', trigger: 'blur' },
    { min: 16, message: '密钥长度通常不少于 16 位', trigger: 'blur' }
  ]
}

// ====== 移动端适配逻辑 ======
const handleMenuSelect = (index) => {
  activeTab.value = index
  if (layoutState.isMobile) {
    layoutState.showMobileMenu = false
  }
}

// 1. 获取账号列表
const fetchAccounts = async () => {
  loading.value = true
  try {
    // 构造分页参数
    const query = new URLSearchParams({
      page: currentPage.value,
      limit: pageSize.value,
      search: searchQuery.value
    }).toString()
    
    const data = await request(`/api/accounts?${query}`)
    if (data.success) {
      accounts.value = data.accounts || []
      // 更新总数
      if (data.pagination) {
        total.value = data.pagination.total
      }
    }
  } catch (error) {
    console.error('Failed to fetch accounts', error)
  } finally {
    loading.value = false
  }
}

// 2. 提交手动添加账号
const submitAddAccount = async () => {
  if (!addFormRef.value) return
  await addFormRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true
      try {
        const data = await request('/api/accounts', {
          method: 'POST',
          body: JSON.stringify(newAccount.value)
        })
        if (data.success) {
          ElMessage.success('账号添加成功！')
          newAccount.value = { service: '', account: '', secret: '', category: '', digits: 6, period: 30 }
          fetchAccounts()
          activeTab.value = 'accounts' // 自动切回列表
        }
      } catch (error) {
      } finally {
        submitting.value = false
      }
    }
  })
}

// 3. 点击获取验证码 (重构：支持倒计时与自动刷新)
const showTotpDialog = ref(false)
const currentTotpAccount = ref(null)
const currentTotpCode = ref('------')
const totpRemaining = ref(30)
let totpInterval = null
let lastTotpEpoch = -1

const totpPercentage = computed(() => {
  const period = currentTotpAccount.value?.period || 30
  return (totpRemaining.value / period) * 100
})

const totpColor = computed(() => {
  if (totpRemaining.value > 10) return '#67C23A'
  if (totpRemaining.value > 5) return '#E6A23C'
  return '#F56C6C'
})

const showTotpCode = (account) => {
  currentTotpAccount.value = account
  currentTotpCode.value = '------'
  lastTotpEpoch = -1
  showTotpDialog.value = true
  
  updateTotpLogic()
  if (totpInterval) clearInterval(totpInterval)
  totpInterval = setInterval(updateTotpLogic, 1000)
}

const updateTotpLogic = () => {
  if (!currentTotpAccount.value) return
  
  const period = currentTotpAccount.value.period || 30
  const now = Date.now() / 1000
  const epoch = Math.floor(now / period)
  const remaining = Math.ceil(period - (now % period))
  
  totpRemaining.value = remaining
  
  // 如果进入了新的周期（epoch 变化），或者当前没有验证码，则刷新
  if (epoch > lastTotpEpoch) {
    fetchTotpCode()
    lastTotpEpoch = epoch
  }
}

const fetchTotpCode = async () => {
  try {
    const data = await request('/api/accounts/generate-totp', {
      method: 'POST',
      body: JSON.stringify({ secret: currentTotpAccount.value.secret })
    })
    if (data.success) {
      currentTotpCode.value = data.code
    }
  } catch (error) {}
}

const stopTotpTimer = () => {
  if (totpInterval) clearInterval(totpInterval)
  totpInterval = null
}

const copyCode = async () => {
  if (currentTotpCode.value === '------') return
  try {
    await navigator.clipboard.writeText(currentTotpCode.value)
    ElMessage.success('验证码已复制')
  } catch (e) {}
}

// 4. 删除账号
// ====== 批量选择与删除逻辑 ======
const selectedIds = ref([])
const isBulkDeleting = ref(false)

const toggleSelection = (id) => {
  const index = selectedIds.value.indexOf(id)
  if (index > -1) selectedIds.value.splice(index, 1)
  else selectedIds.value.push(id)
}

const selectAllVisible = () => {
  accounts.value.forEach(acc => {
    if (!selectedIds.value.includes(acc.id)) selectedIds.value.push(acc.id)
  })
}

const handleBulkDelete = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.length} 个账号吗？删除后无法恢复！`,
      '高危操作警告',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'error' }
    )
    
    isBulkDeleting.value = true
    // ⚠️ 极其关键：必须使用 for...of 串行发送请求，防止 Cloudflare KV 数据库并发写入冲突导致数据丢失！
    for (const id of selectedIds.value) {
      await request(`/api/accounts/${id}`, { method: 'DELETE' })
    }
    
    ElMessage.success(`成功删除了 ${selectedIds.value.length} 个账号`)
    selectedIds.value = []
    fetchAccounts() // 刷新列表
  } catch (e) {
  } finally {
    isBulkDeleting.value = false
  }
}

// ====== 编辑账号逻辑 ======
const showEditDialog = ref(false)
const isEditing = ref(false)
const editAccountData = ref({ id: '', service: '', account: '', category: '' })

// 处理卡片右上角的下拉菜单
const handleCommand = async (command, account) => {
  if (command === 'delete') {
    try {
      await ElMessageBox.confirm(`确定删除 [${account.service}] 吗？`, '警告', { type: 'error' })
      const data = await request(`/api/accounts/${account.id}`, { method: 'DELETE' })
      if (data.success) {
        ElMessage.success('账号已删除')
        fetchAccounts()
      }
    } catch (e) {}
  } else if (command === 'edit') {
    // 弹出编辑框并回显数据
    editAccountData.value = { 
      id: account.id, 
      service: account.service, 
      account: account.account, 
      category: account.category || '' 
    }
    showEditDialog.value = true
  }
}

// 提交编辑保存
const submitEditAccount = async () => {
  if (!editAccountData.value.service || !editAccountData.value.account) {
    return ElMessage.warning('服务名称和账号不能为空')
  }
  isEditing.value = true
  try {
    const data = await request(`/api/accounts/${editAccountData.value.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        service: editAccountData.value.service,
        account: editAccountData.value.account,
        category: editAccountData.value.category
      })
    })
    if (data.success) {
      ElMessage.success('账号修改成功')
      showEditDialog.value = false
      fetchAccounts()
    }
  } catch (e) {
  } finally {
    isEditing.value = false
  }
}

// 5. 扫码成功后的处理逻辑
const handleScanSuccess = async (uri) => {
  try {
    // 调用后端解析 URI
    const data = await request('/api/accounts/parse-uri', { 
      // ⚠️ 注意：这里也由于路由重构，改成了 /api/accounts/parse-uri
      method: 'POST',
      body: JSON.stringify({ uri })
    })

    if (data.success && data.account) {
      const acc = data.account
      // 弹窗确认
      await ElMessageBox.confirm(
        h('div', { style: 'text-align:left; background:#f5f7fa; padding:15px; border-radius:8px;' }, [
          h('p', [h('strong', '服务方：'), acc.issuer || '未知']),
          h('p', [h('strong', '账号：'), acc.account || '未知']),
          h('p', [h('strong', '算法：'), `${acc.algorithm} (${acc.digits}位 / ${acc.period}秒)`])
        ]),
        '✅ 二维码解析成功，确认添加？',
        {
          confirmButtonText: '确认添加',
          cancelButtonText: '取消',
          type: 'success'
        }
      )

      // 确认后调用添加接口
      const addData = await request('/api/accounts/add-from-uri', {
        // ⚠️ 同理，改成了 /api/accounts/add-from-uri
        method: 'POST',
        body: JSON.stringify({ uri, category: '手机扫码' })
      })

      if (addData.success) {
        ElMessage.success('扫码账号添加成功！')
        fetchAccounts() // 刷新列表
        activeTab.value = 'accounts' // 切回列表页
      }
    }
  } catch (err) {
    if (err !== 'cancel') console.error(err)
  }
}

// ==========================================
// 数据导入成功后的联动处理
// ==========================================
const handleImportSuccess = () => {
  fetchAccounts()           // 重新拉取最新的账号列表
  activeTab.value = 'accounts' // 自动把标签页切回“我的账户”
}

onMounted(() => {
  fetchAccounts()
})

</script>

<style scoped>
.home-container {
  height: 100%; /* 占满父容器 (App.vue 的 main) */
  background-color: #f5f7fa;
}

.mobile-profile {
  padding: 4px !important;
  width: 40px;
  height: 40px;
  justify-content: center;
  border-radius: 50% !important;
}

.username {
  font-weight: 600;
  color: #606266;
  font-size: 14px;
}

.main-body {
  height: 100%; /* 自动填充 */
  display: flex;
  overflow: hidden; /* 内部滚动 */
}

.left-aside {
  background: white;
  border-right: 1px solid #e6e6e6;
}

.side-menu {
  border-right: none;
  padding-top: 10px;
}

.main-content {
  padding: 30px 20px;
  width: 100%;
  background-color: #f5f7fa;
  overflow-y: auto; /* 内容区独立滚动 */
}

.tab-card-wrapper {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  min-height: 400px;
}

.account-card {
  border-radius: 12px;
  transition: all 0.3s ease;
  border: none;
}

.account-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.service-name {
  margin: 0 0 5px 0;
  font-size: 18px;
  color: #303133;
}

.account-name {
  color: #909399;
  font-size: 14px;
  margin: 0 0 20px 0;
  word-break: break-all;
}

.more-icon {
  cursor: pointer;
  color: #909399;
  padding: 5px;
}

.more-icon:hover {
  color: #409EFF;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
}

.code-btn {
  width: 100%;
  border-radius: 8px;
}

.loading-state, .empty-state {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.account-card.is-selected {
  border: 1px solid #409EFF;
  background-color: #f4f9ff;
}

.totp-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
}

.totp-service {
  font-size: 14px;
  color: #909399;
  margin-bottom: 5px;
}

.totp-code {
  font-size: 36px;
  font-weight: bold;
  color: #409EFF;
  letter-spacing: 6px;
  margin: 15px 0;
  cursor: pointer;
  transition: transform 0.1s;
}

.totp-code:active {
  transform: scale(0.95);
}

.totp-timer {
  margin: 10px 0;
}

.timer-text {
  font-size: 16px;
  font-weight: bold;
  color: #606266;
}

.totp-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 10px;
}
</style>