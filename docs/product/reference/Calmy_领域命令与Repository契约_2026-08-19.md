# Calmy 领域命令与 Repository 契约

> 让 UI、AI、IndexedDB、D1 和 Markdown Adapter 通过统一领域接口协作。  
> 版本：v0.1 · 日期：2026-08-19
>
> 本文件保留领域契约和验收参考；未完成实施项统一见 [`../OPEN_WORK.md`](../OPEN_WORK.md)，不在此处维护独立任务。

关联文档：[领域模型与状态机](Calmy_领域模型与状态机_2026-08-19.md)、[AI / 同步协议](Calmy_AI行为规则与开放数据同步协议_2026-08-19.md)

## 1. 总体边界

```text
UI / AI / Adapter
        ↓
Domain Command
        ↓
Repository API
        ↓
IndexedDB（MVP 本地主事实源）
        ↓
Projection + Mutation Log
```

约束：

- UI 不直接写 IndexedDB。
- AI 不直接写实体。
- Markdown Adapter 不直接覆盖实体。
- 所有持久化写入都有 `command_id`、`actor`、`source` 和 `revision`。
- Repository 返回领域对象或稳定的领域错误，不泄露具体存储实现。

## 2. Command 统一结构

```ts
type DomainCommand<TPayload> = {
  command_id: string;
  command_type: string;
  actor: 'user' | 'ai_assisted' | 'import' | 'sync';
  actor_id: string;
  source_ids?: string[];
  expected_revision?: number;
  payload: TPayload;
  occurred_at: string;
};
```

### 写入规则

- `command_id` 幂等：同一个命令重复提交不得产生重复结果。
- `expected_revision` 不匹配时返回冲突，不使用最后写入者覆盖。
- `actor=ai_assisted` 必须有 `confirmed_by` 或明确是草稿写入。
- `source_ids` 用于追踪 Record、AI 建议或导入文件来源。
- 命令成功后同时产生 Domain Event 和 Mutation Log。

## 3. MVP Command 清单

### Matter

```ts
CreateMatter({ title, why?, owner_id })
UpdateMatter({ matter_id, patch, expected_revision })
PauseMatter({ matter_id, reason?, expected_revision })
ResumeMatter({ matter_id, expected_revision })
ArchiveMatter({ matter_id, expected_revision })
RestoreMatter({ matter_id, expected_revision })
```

### Cycle / Stage

```ts
CreateCycle({ matter_id, theme, parent_cycle_id? })
UpdateCycle({ cycle_id, patch, expected_revision })
TransitionStage({ cycle_id, to_stage, reason?, expected_revision })
PauseCycle({ cycle_id, reason?, expected_revision })
CompleteCycle({ cycle_id, summary?, expected_revision })
ReopenCycle({ cycle_id, reason?, expected_revision })
```

### Action

```ts
CreateAction({ title, matter_id?, cycle_id?, due_date? })
UpdateAction({ action_id, patch, expected_revision })
StartAction({ action_id, expected_revision })
CompleteAction({ action_id, result_note?, expected_revision })
SkipAction({ action_id, reason?, expected_revision })
CancelAction({ action_id, reason?, expected_revision })
ReopenAction({ action_id, expected_revision })
```

### Record / Today

```ts
CaptureRecord({ body, occurred_at?, source? })
LinkRecord({ record_id, matter_id?, person_ids?, action_id? })
ReviseRecord({ record_id, body, reason, expected_revision })
RedactRecord({ record_id, reason, expected_revision })
SetTodayOpening({ date, focus_action_ids, why, let_go, load })
CompleteDailyReview({ date, observation, analysis, adjustment, seed? })
```

### AI / Import

```ts
CreateAiDraft({ kind, payload, evidence_ids })
ConfirmAiSuggestion({ draft_id, patch?, confirmed_by })
RejectAiSuggestion({ draft_id, reason? })
ImportEntity({ file_path, content_hash, parsed_entity })
ResolveImportConflict({ conflict_id, resolution })
```

## 4. Domain Event 清单

| Event | 触发命令 | 关键字段 |
|---|---|---|
| `MatterCreated` | CreateMatter | matter_id、actor、source |
| `MatterPaused` | PauseMatter | matter_id、reason、previous_status |
| `CycleCreated` | CreateCycle | cycle_id、matter_id、theme |
| `StageTransitioned` | TransitionStage | cycle_id、from、to、reason |
| `ActionCompleted` | CompleteAction | action_id、occurred_at、result_note |
| `RecordCreated` | CaptureRecord | record_id、occurred_at、body_hash |
| `RecordRevised` | ReviseRecord | record_id、previous_revision、reason |
| `TrajectoryProposed` | AI / Review | evidence_ids、confidence |
| `TrajectoryConfirmed` | ConfirmAiSuggestion | confirmed_by、final_value |
| `ImportConflictDetected` | ImportEntity | entity_id、local_revision、incoming_revision |
| `ConflictResolved` | ResolveImportConflict | conflict_id、resolution、actor |

Reality Record 与 Domain Mutation 必须分开：前者描述生活事实，后者描述系统对象发生了什么变化。

## 5. Repository 接口

```ts
interface CalmyRepository {
  getMatter(id: string): Promise<Matter | null>;
  listMatters(query?: MatterQuery): Promise<Matter[]>;
  getToday(date: string): Promise<Today | null>;
  listRecords(query: RecordQuery): Promise<Record[]>;
  getInbox(): Promise<Record[]>;
  getRevision(entityType: string, id: string): Promise<number>;

  dispatch<T>(command: DomainCommand<T>): Promise<CommandResult>;

  getMutations(query?: MutationQuery): Promise<Mutation[]>;
  rebuildProjection(): Promise<RebuildResult>;
  exportWorkspace(options?: ExportOptions): Promise<ExportManifest>;
  importWorkspace(input: ImportInput): Promise<ImportReport>;
}
```

Repository 不暴露：

- IndexedDB object store 名称；
- D1 SQL；
- Markdown 文件路径细节；
- AI provider 的调用参数；
- UI 组件状态。

## 6. CommandResult 与错误模型

```ts
type CommandResult =
  | {
      ok: true;
      entity_ids: string[];
      event_ids: string[];
      revisions: Record<string, number>;
    }
  | {
      ok: false;
      error: DomainError;
    };
```

```ts
type DomainError = {
  code:
    | 'VALIDATION_FAILED'
    | 'NOT_FOUND'
    | 'INVALID_TRANSITION'
    | 'REVISION_CONFLICT'
    | 'PERMISSION_DENIED'
    | 'IMPORT_INVALID'
    | 'DUPLICATE_COMMAND'
    | 'OFFLINE_WRITE_FAILED';
  message: string;
  entity_id?: string;
  field?: string;
  details?: Record<string, unknown>;
  retryable: boolean;
};
```

错误要让 UI 能决定下一步：修正字段、重新读取、显示差异、稍后重试或请求用户确认。

## 7. Read Model 建议

写模型和 UI 读取模型分离，避免页面自己拼领域关系。

### TodayReadModel

```ts
type TodayReadModel = {
  date: string;
  direction: { matter_id: string; title: string; cycle_theme?: string } | null;
  load: 'good' | 'normal' | 'tired' | 'bad' | null;
  must_protect: string[];
  focus_actions: ActionSummary[];
  optional_actions: ActionSummary[];
  let_go: string[];
  unresolved_inbox_count: number;
};
```

### MatterDetailReadModel

```ts
type MatterDetailReadModel = {
  matter: Matter;
  current_cycle: Cycle | null;
  current_stage_label: string | null;
  connected_actions: ActionSummary[];
  recent_records: RecordSummary[];
  trajectory: TrajectoryView | null;
  pending_suggestions: SuggestionSummary[];
};
```

Read Model 可以缓存和重建，不能成为唯一事实源。

## 8. 幂等、事务与并发

- 一个 Command 的实体写入、Event 写入和 Mutation Log 写入必须在同一事务中完成。
- 重复 `command_id` 返回第一次的结果，不重复创建实体。
- 批量导入按实体隔离失败；一份坏文件不能阻塞其他文件。
- Projection 重建必须可以重复执行，结果保持一致。
- Revision 冲突返回双方摘要和可重试 token，不自动合并结构化字段。

## 9. Adapter 规则

### IndexedDB Adapter

- 负责本地持久化、事务、离线和版本迁移。
- 不负责 UI 业务判断。

### Markdown Adapter

- 负责 Frontmatter 解析、正文保留、文件路径和 manifest。
- 不负责决定 Matter 是否升级，也不负责改变状态机。

### D1 / Sync Adapter

- 第一阶段只作为镜像和同步通道。
- 必须携带 revision、hash、source、actor 和 conflict metadata。
- 不得静默覆盖本地更改。

## 10. Contract Test 清单

- [ ] 重复提交同一 `command_id` 不产生重复 Entity。
- [ ] 错误的 `expected_revision` 返回 `REVISION_CONFLICT`。
- [ ] 非法 Stage 转换返回 `INVALID_TRANSITION`。
- [ ] AI `suggestion` 不产生实体 Mutation。
- [ ] `ConfirmAiSuggestion` 必须留下 confirmed_by 和 source_ids。
- [ ] Projection 删除并重建后与当前读取结果一致。
- [ ] 导入重命名文件后仍使用原 `calmy_id`。
- [ ] 导入冲突不覆盖本地修改。
- [ ] 离线写入完成后，恢复网络不重复写入。
