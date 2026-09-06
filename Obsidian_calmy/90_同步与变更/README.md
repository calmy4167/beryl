# 90 同步与变更

本目录维护总文档与模块文档之间的双向同步规则。

## 文件

- `Calmy-文档同步.ps1`：同步执行工具。
- `同步配置.json`：总文档、章节边界和模块路径映射。
- `.同步状态.json`：最近一次成功同步的哈希基线，由工具维护。
- `同步冲突.md`：仅在总文档和模块同时变化时生成。

## 日常使用

在 `D:\dsharness\Obsidian_calmy` 中运行：

```powershell
.\90_同步与变更\Calmy-文档同步.ps1 -Mode Auto
```

自动模式规则：

- 总文档单边变化：总文档 → 模块。
- 模块单边变化：模块 → 总文档。
- 双边变化：停止、保留两边、生成冲突报告。

若希望编辑时持续同步：

```powershell
.\90_同步与变更\Calmy-文档同步.ps1 -Mode Watch -IntervalSeconds 3
```

## 强制方向

只有在人工确认应覆盖另一侧时使用：

```powershell
.\90_同步与变更\Calmy-文档同步.ps1 -Mode MasterToModules -Force
.\90_同步与变更\Calmy-文档同步.ps1 -Mode ModulesToMaster -Force
```

强制同步会覆盖另一侧未合并的修改，应先人工比较冲突内容。
