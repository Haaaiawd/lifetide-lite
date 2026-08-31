# Application and statechart architecture

- Field: application architecture, statecharts and failure recovery
- Status: project-specific professional stance
- Governs: `.loom/design/state-and-persistence-protocol.md`, TASK-008 and every later workflow transition

## The engineering problem

人生试运行既不是一次请求，也不是纯聊天记录。它同时包含用户可编辑的证据、异步模型提议、确定性的产品阶段、失败重试和长达多天的试验。真正的风险不是组件怎么切，而是出现两个“当前状态”：UI 认为已进入下一阶段，数据库却只提交了一半；或一次超时重试把同一批问题提交两次。

## Selected approach

1. **XState v5 是唯一运行时控制平面。** React 组件只发送命令并渲染持久化 snapshot；API route、模型和 prompt 都不能私自推进阶段。
2. **状态图 + 事务事件账本 + 当前 snapshot。** 这不是完整事件溯源。关系表/JSON artifact 仍是业务真相；append-only transition event 提供幂等、审计和恢复证据；snapshot 是快速恢复点，可由最后一个有效 snapshot 加后续 committed events 校验。
3. **proposal 与 commit 分开。** 模型产物只进入 ephemeral proposal storage 或请求内存；通过 schema、权限、source revision、state guard 后，宿主在同一数据库事务中写业务对象、committed event 和新 snapshot。
4. **乐观并发。** 每条可改变会话的命令携带 `base_revision`。事务锁定 session head，只有相等才能提交；成功后 revision 恰好 `+1`。
5. **语义与身份分开。** Interviewer 只在 `open_wave` proposal 中负责 5–10 个决策目标及首批问题；宿主不补写语义，只验证 exact refs/本地索引并恰好一次分配 wave、mission、unit、question、option 与 provenance ids。`propose_deep_dive` 只推荐深挖理由；被接受后由另一轮基于最新 revision 的 `open_wave` 生成完整波次。
6. **生成条件是业务事实。** accepted proposal 的 prompt/schema/context/model/config/fixture 版本进入不可变 GenerationProvenance，并与生成 records、event、snapshot 同事务提交。
7. **历史状态恢复。** pause/degraded 保存 `resume_state`；恢复不是猜测默认页，而是返回最后一个已提交且仍合法的业务子状态。
8. **可执行就绪而非模型评分。** 路线门由宿主在单一 committed revision 上纯推导；模型可以提供语义 artifact，不能提供或覆盖 `GateStatus`。
9. **工具链也是控制边界。** TASK-008 固定 pnpm 10.24.0、匹配的 Prisma CLI/Client 6.6.0、允许的 Prisma client build script 与生成命令；干净安装证据必须先于 schema/API 改造。

## Why this is the smallest complete design

只把状态塞进 React 会丢掉刷新、重试和并发安全；完整 event sourcing 会要求为所有业务投影建立回放与迁移机制，超过 Lite 所需。当前方案只为“改变阶段的事实”保留事件账本，同时保留清晰的业务表和 snapshot，因此既能审计又不把项目变成分布式系统 cosplay。(￣▽￣;)

## Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| component-local reducers / URL as state | 刷新、跨设备、后台模型回调和重试会产生分叉真相 |
| prompt decides next state | 不能可靠执行题量、安全、revision 和幂等守卫 |
| a second conversation runtime beside XState | 会制造双控制平面和恢复歧义 |
| full event sourcing for all domain objects | 对 Lite 过重；迁移、投影和回放成本高于当前收益 |
| compensating partial writes | 用户证据与派生理解不可接受短暂不一致；应由单事务避免部分提交 |

## Failure modes and required response

| Failure | Required architectural behavior |
| --- | --- |
| duplicate delivery | 命中同 session 的 idempotency unique key，返回既有 committed result，不增加 revision |
| stale browser tab | `base_revision` 冲突；返回最新 snapshot，不覆盖新状态 |
| model timeout / invalid proposal | 不产生业务 commit；进入可恢复 degraded 状态或保留原状态供重试 |
| crash after model response | 没有 committed event 就视为未发生；同 idempotency key 可安全重试 |
| crash during commit | 数据库事务整体提交或整体回滚 |
| invalid persisted snapshot | 从最后有效 snapshot + ledger 校验；仍不能恢复则只读导出/支持路径，不猜状态 |
| safety trigger | 高优先级进入 `safety_stop`，取消普通规划 actor；不能自动回到访谈 |

## Observable proof

- transition table 的每个允许/禁止组合都有 table test；
- 相同 idempotency key 重放不会多出事件、对象或 revision；
- 并发使用同一 base revision 时恰好一个提交成功；
- 任意故障注入点都不存在业务对象已写而 snapshot/event 未写的状态；
- pause、刷新和 provider 恢复返回同一个 history state；
- XState inspector/event traces 中只有宿主 commit 事件改变持久状态。
