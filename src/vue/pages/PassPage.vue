<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="simple-page">
    <section class="beryl-card empty-state">
      <h1 class="font-title">设置访问密码</h1>
      <p>首次登录流程已迁移到 React 页面。请返回今天继续使用。</p>
      <button class="app-button primary" type="button" @click="router.push('/app/today')">进入今天</button>
    </section>
  </div>
</template>
