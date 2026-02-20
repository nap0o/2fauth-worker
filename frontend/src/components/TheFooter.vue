<template>
  <footer class="global-footer">
    <div class="footer-content">
      <p>
        &copy;{{ new Date().getFullYear() }} <a href="https://github.com/nap0o/2fauth-worker" target="_blank" rel="noopener noreferrer">2FAuth</a>
        <span class="divider">|</span>
        您的专属云端双因素认证管家
      </p>
    </div>
  </footer>
</template>

<script setup>
// 这里可以添加页脚需要的逻辑，例如版本号显示等
</script>

<style scoped>
.global-footer {
  width: 100%;
  padding: 0.25rem 0;
  background-color: #f8f9fa;
  border-top: 1px solid #e9ecef;
  text-align: center;
  margin-top: auto;
}

.footer-content {
  color: #6c757d;
  font-size: 0.875rem;
}

.divider {
  margin: 0 0.5rem;
  color: #dee2e6;
}

a {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s;
}

a:hover {
  color: #409EFF;
}
</style>