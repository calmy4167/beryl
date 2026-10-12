/** 「留白」组件的共享类型。放在 .ts 里：`<script setup>` 不允许 ES 模块导出。 */
export interface LbStat {
  label: string
  value: string | number
  unit?: string
  sub?: string
  accent?: boolean
  bar?: { pct: number; color?: string }
}
