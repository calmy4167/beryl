# Calmy 页面组件组合约定

这些约定先落在 People 和 Finance 两个样板页中，供之后逐页迁移时复用。目标是让字段名称、控件、状态和动作有一致的位置，同时保留原生表单行为。

## 字段

用 `CalmyField` 表达一个字段的可见名称和可选说明；里面放一个控件。Field 会把唯一控件 id、label id、必填状态、hint/error 描述关系提供给 `CalmyInput`、`CalmyNativeSelect` 和 `CalmySelect`。

```vue
<CalmyField label="金额" hint="最多填写两位小数。" required>
  <CalmyInput v-model="amount" inputmode="decimal" required />
</CalmyField>
```

- 用 `CalmyInput` 承载短文本、日期、数值和多行文字；多行内容传 `multiline`。
- 用 `CalmyNativeSelect` 承载普通表单选择。它保留原生键盘行为和浏览器必填校验，选项用 `<option>` 组合。
- 用 `CalmySelect` 承载需要 Calmy 自绘菜单、typeahead 或自定义选项展示的单选。单纯原生选择优先用 `CalmyNativeSelect`。
- 复选框保留原生 checkbox 语义；在同一个 label 内说明它代表的选择。
- 错误通过 `error` 传给 `CalmyField`，不要只靠颜色；Field 会将错误关联到控件并显示为可读文本。
- hint 放在对应控件下方，只写帮助完成当前输入的信息。长解释继续用说明段落，不要塞进 placeholder。

## 按钮

```vue
<CalmyButton variant="primary" type="submit" :disabled="saving">
  {{ saving ? '保存中…' : '保存' }}
</CalmyButton>
<CalmyButton variant="danger" @click="archive">归档</CalmyButton>
```

- `primary` 只用于当前表单或流程的主要推进动作；`default` 用于次要动作；`danger` 用于删除、归档等有损动作；`active` 用于筛选或切换组中的当前项。
- 非提交动作写明 `type="button"`。危险动作沿用现有确认、撤销或恢复路径。
- 加载时显示动作状态文字并传 `loading` 或 `disabled`，不要仅依赖淡化样式。

## 面板

使用 `LbPanel` 为一组相关内容提供标题和说明。少量与该面板直接相关的动作放进 `#header-actions`；其余动作靠近对应内容，避免面板标题行堆满按钮。

```vue
<LbPanel title="记录" note="12 条">
  <template #header-actions>
    <CalmyButton>导出</CalmyButton>
  </template>
  <!-- 列表或表单内容 -->
</LbPanel>
```

## 图片与媒体

当前 People 与 Finance 页没有重复的图片编辑或头像模式，因此图片继续使用合适的原生媒体元素，不增加尚无稳定契约的包装组件。出现跨页重复场景后，再统一尺寸比例、替代文本、加载失败和裁切行为。
