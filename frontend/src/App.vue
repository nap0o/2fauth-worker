<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import TheHeader from './components/TheHeader.vue'
import TheFooter from './components/TheFooter.vue'
import { layoutState } from './states/layout'

const route = useRoute()

const checkMobile = () => {
  layoutState.isMobile = window.innerWidth < 768
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<template>
  <div class="app-container">
    <!-- 登录页通常不显示头部，可以通过路由 meta 控制，这里简单示例默认显示 -->
    <TheHeader v-if="!route.meta.hideHeader" />
    
    <main>
      <RouterView />
    </main>
    <TheFooter />
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 改为固定高度，以便内部滚动 */
  overflow: hidden;
}
main {
  flex: 1;
  overflow: hidden; /* 防止 main 自身滚动，让子元素决定 */
  display: flex;
  flex-direction: column;
}
</style>
