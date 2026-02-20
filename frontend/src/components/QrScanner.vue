<template>
  <div class="qr-scanner-wrapper">
    <div class="scan-actions">
      <el-button type="primary" size="large" @click="startCamera" :loading="isStarting">
        <el-icon><Camera /></el-icon> 启动摄像头扫描
      </el-button>
      <el-button size="large" @click="triggerFileUpload">
        <el-icon><Picture /></el-icon> 上传图片识别
      </el-button>
      <input 
        type="file" 
        ref="fileInputRef" 
        accept="image/*" 
        style="display: none" 
        @change="handleFileUpload" 
      />
    </div>

    <div v-show="isScanning" class="camera-container">
      <video ref="videoRef" class="video-preview" autoplay muted playsinline></video>
      <div class="scan-overlay">
        <div class="scan-line"></div>
      </div>
      <div class="camera-controls">
        <el-button type="danger" round @click="stopCamera">关闭摄像头</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { Camera, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import jsQR from 'jsqr'

// 定义向父组件 (Home.vue) 传递结果的事件
const emit = defineEmits(['scan-success'])

const videoRef = ref(null)
const fileInputRef = ref(null)
const isScanning = ref(false)
const isStarting = ref(false)

let stream = null
let scanInterval = null

// ==========================================
// 1. 摄像头实时扫描逻辑
// ==========================================
const startCamera = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    ElMessage.error('您的浏览器不支持摄像头功能')
    return
  }
  
  isStarting.value = true
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' } // 优先调用后置摄像头
    })
    
    videoRef.value.srcObject = stream
    
    // 等待视频流加载完成后开始扫描
    videoRef.value.onloadedmetadata = () => {
      videoRef.value.play()
      isScanning.value = true
      isStarting.value = false
      scanInterval = setInterval(scanVideoFrame, 500) // 每半秒截取一帧分析
      ElMessage.success('摄像头已启动，请将二维码对准取景框')
    }
  } catch (err) {
    isStarting.value = false
    ElMessage.error('无法访问摄像头，请检查权限设置')
    console.error('Camera error:', err)
  }
}

const stopCamera = () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }
  if (scanInterval) {
    clearInterval(scanInterval)
    scanInterval = null
  }
  isScanning.value = false
}

// 抽取视频帧进行二维码解析
const scanVideoFrame = () => {
  if (!videoRef.value || videoRef.value.readyState !== videoRef.value.HAVE_ENOUGH_DATA) return
  
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  
  canvas.width = videoRef.value.videoWidth
  canvas.height = videoRef.value.videoHeight
  ctx.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height)
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(imageData.data, imageData.width, imageData.height)
  
  if (code && code.data.startsWith('otpauth://')) {
    stopCamera() // 扫到了就马上关掉摄像头
    emit('scan-success', code.data) // 把扫到的 URI 传给 Home.vue
  }
}

// ==========================================
// 2. 静态图片上传识别逻辑
// ==========================================
const triggerFileUpload = () => {
  fileInputRef.value.click()
}

const handleFileUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (event) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      
      if (code && code.data.startsWith('otpauth://')) {
        emit('scan-success', code.data)
      } else {
        ElMessage.error('未能从图片中识别出有效的 2FA 二维码')
      }
    }
    img.src = event.target.result
  }
  reader.readAsDataURL(file)
  e.target.value = '' // 清空 input，允许重复上传同一张图片
}

// 组件销毁前务必关掉摄像头，防止偷偷耗电
onBeforeUnmount(() => {
  stopCamera()
})
</script>

<style scoped>
.qr-scanner-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.scan-actions {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
}

.camera-container {
  position: relative;
  width: 100%;
  max-width: 500px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  background-color: #000;
}

.video-preview {
  width: 100%;
  display: block;
}

.scan-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 250px;
  height: 250px;
  border: 2px solid rgba(64, 158, 255, 0.8);
  box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.4);
  border-radius: 12px;
  pointer-events: none;
}

/* 炫酷的扫描线动画 */
.scan-line {
  width: 100%;
  height: 2px;
  background-color: #409EFF;
  box-shadow: 0 0 10px #409EFF;
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% { transform: translateY(0); }
  50% { transform: translateY(250px); }
  100% { transform: translateY(0); }
}

.camera-controls {
  position: absolute;
  bottom: 20px;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
}
</style>