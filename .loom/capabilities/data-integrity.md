# Evidence and transactional data integrity

- Field: database integrity, versioned evidence and privacy-preserving persistence
- Status: project-specific professional stance
- Governs: source identity, derived-artifact validity, tenant isolation, deletion and TASK-008 migrations

## Integrity invariant

任何改变用户理解、雷达、路线或试验的派生对象，都必须能回答：“它依赖的是哪个 session 中、哪条逻辑来源的哪个不可变版本？” 单独的 `source_id` 不构成证据引用。

## Selected persistence model

```text
SourceHead(session_id, source_id) -> active_revision | deleted_at
SourceVersion(session_id, source_id, revision) -> immutable content metadata
DerivedArtifact -> one or more exact SourceRef(session_id implied, source_id, source_revision)
GeneratedArtifact -> GenerationProvenance(prompt/schema/context/model/config/fixture versions)
```

- `SourceVersion` 的复合唯一键是 `(session_id, source_id, revision)`；版本行不可原地修改。
- 同一 `(session_id, source_id)` 最多一个 active head。编辑在事务中插入 `revision + 1`、更新 head、把依赖旧版本的派生对象标为 `stale`。
- 删除不物理改写历史版本：head 记为 deleted，受保护正文按保留政策擦除或 tombstone；所有直接和传递依赖变为 `invalidated`，不得继续生成。
- 同 session 校验不是应用层建议，而是数据库外键/复合约束与事务内校验共同保证。active artifact 的支持引用必须指向 active head；失效传播/审计的因果引用可指向真实的旧版本，但绝不能支持新 artifact。跨租户 SourceRef 一律拒绝。
- 派生链维护显式 dependency edge；stale/invalidated 从被替换的 SourceVersion 向下游闭包传播。校准生成的新 source 可以支持替代对象，但不能复活旧对象。
- 每个 accepted model proposal 在 commit 事务内创建一条不可变 `GenerationProvenance`；所有该次生成的顶层 records 以必填外键引用它。失败 proposal 不留 row，幂等 replay 不重复 row，运行日志不能替代 domain provenance。
- 每个校准 verdict 都是 `kind="calibration"` 的 SourceVersion，即使用户没有补充文字；否则“准确”反馈会成为无法引用的幽灵事实。

## Concurrency and idempotency

- 所有 mutation 在 transaction 内锁定 session head 或使用等价的 compare-and-swap revision；
- `base_revision` 必须等于当前 session revision；成功 commit 后只加一；
- `(session_id, idempotency_key)` 唯一；同 key 同 payload 返回已有结果，同 key 不同 payload 是冲突；
- proposal id 与 committed event 一对零或一，绝不一对多；
- 写 provenance、业务对象、dependency edges、transition event、snapshot 和 revision 是一个事务边界。

## Rejected shortcuts

| Shortcut | Failure it creates |
| --- | --- |
| overwrite source row in place | 无法证明旧洞察依赖哪版回答 |
| use globally unique source id but omit revision | id 唯一仍无法识别编辑后的陈旧引用 |
| background eventual stale propagation | 窗口期内旧判断可能继续生成路线 |
| cascade-delete every historical artifact | 用户失去可解释的修改历史和审计线索 |
| trust model-returned ids | 会产生跨 session、虚构或已删除引用 |
| keep prompt/model versions only in logs | 日志过期或采样后无法重现 artifact 的生成条件 |

## Deletion and retention

- guest expiry 和用户删除使用同一 invalidation protocol；
- 普通日志只保留 opaque ids、事件类型、hash、耗时和错误码，不写正文/excerpt；
- event ledger 不保存敏感原文；擦除正文后仍可保留最小 tombstone 证明删除和防止幽灵引用；
- 导出只包含当前用户可见 artifact 及其人类可读来源标签，不暴露内部 prompt、模型日志或别的 tenant id。

## Observable proof

- contract tests: `s@1 -> s@2`、deleted head、cross-tenant ref、无文本/有纠正校准、同 key 重试、同 key 异载荷、事务回滚；
- property tests: 任意合法编辑序列后，没有 active artifact 依赖非 active source version；
- integration tests: guest cleanup、upload deletion、answer revision 对所有下游对象作闭包传播；
- provenance tests: accepted commit 的每个 generated record 都有完整可解析外键；失败/重复 delivery 不制造孤儿或重复 generation rows；
- migration verification: 数据库约束能拒绝重复 revision、两个 active heads、跨 session dependency edge 和无对应 provenance 的 generated record。
