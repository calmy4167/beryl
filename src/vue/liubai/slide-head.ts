import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 页面自带头部。
 *
 * 「留白」外壳默认渲染 slide-head（hint + 标题 + info 气泡）。
 * 但六个模块页需要参考稿自己的头部（h1 带 <em> 计数、info 提示、日期导航），
 * 因此迁移到 v11 标记的页面在挂载时声明"自己负责头部"，外壳让位。
 */
export const pageOwnsHead = ref(false)

export function useOwnSlideHead() {
  onMounted(() => { pageOwnsHead.value = true })
  onBeforeUnmount(() => { pageOwnsHead.value = false })
}
