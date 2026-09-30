<script setup lang="ts">
import UserManagementPanel from '@/vue/components/UserManagementPanel.vue'
</script>

<template>
  <div class="user-admin-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">系统管理</p>
        <h1 class="font-title">用户管理</h1>
        <p>创建和管理 Calmy 登录账号。账号身份与现实人物资料分开维护。</p>
      </div>
    </header>
    <UserManagementPanel />
  </div>
</template>

<style scoped>
.user-admin-page { max-width: 1040px; margin: 0 auto; padding-bottom: 48px; }
</style>
