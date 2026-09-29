# Calmy 多人场景、模块关系与数据共享核心设计方案

## 1. 这套设计到底要解决什么

Calmy 后面会天然出现大量与“人”和“共同生活”有关的数据：

家庭、情侣、朋友、孩子、父母、旅行、健康、财务、资产、纪念日、共同任务、共同文件、共同回忆……

如果每个模块分别设计自己的共享体系：

- 财务做家庭账本共享；
- 健康做健康档案共享；
- 文件做文件夹共享；
- 旅行做成员协作；
- 回忆做相册权限；
- 任务再做一套协作者机制；

最终整个系统一定会变成多个互不兼容的小系统。

因此，Calmy 不应该先问：

> 一个页面应该怎么分享？

而应该先解决一个更底层的问题：

> **现实中的人与人，因为共同面对某个人、某件事情或某段生活，应该如何共同产生、访问、修改和保留数据？**

所以，共享不是一个独立功能。

它应该建立在 Calmy 整套现实数据模型之上。

---

# 2. 先确定整个系统的核心对象

Calmy 的多人和数据体系，可以分成以下几个核心概念：

```text
User
系统账号

Person
现实中的人

Space
长期关系环境

Thing
现实中的一件事

Scene
一件事在某一阶段形成的现实情境

Entity
实际产生的数据对象

Domain
数据所属的生活领域

Relation
对象之间的关系

Ownership
数据属于谁、由谁管理

Permission / Scope
谁为什么能够访问

View
最终如何呈现
```

它们分别解决不同的问题。

一句话概括：

> **Person 解决“是谁”，Thing 解决“发生了什么”，Scene 解决“现在处于什么共同情境”，Space 解决“我们长期处于什么关系”，Entity 解决“产生了什么数据”，Domain 解决“这些数据属于生活中的哪个领域”，Relation 把它们连接起来，Ownership 和 Permission 决定数据归属和访问，View 决定每个人最终看到什么。**

---

# 3. User 和 Person 必须彻底分开

这是整个系统第一条底层原则。

## User

User 是 Calmy 的数字账号。

它负责：

```text
登录
认证
设备同步
订阅
账号安全
云端身份
```

例如：

```text
User

id: U001
邮箱：xxx
```

---

## Person

Person 表示现实世界中的一个人。

例如：

```text
P001 我
P002 爸爸
P003 妈妈
P004 妹妹
P005 女朋友
```

爸爸即使从来没有注册过 Calmy，也依然可以存在。

因此：

```text
User ≠ Person
```

而是：

```text
User
  ↓
绑定
  ↓
Person
```

一个 Person 可以处于两种状态：

```text
未绑定账号
爸爸只是现实人物

或

已绑定账号
爸爸后来注册了 Calmy
```

现实人物先存在，账号只是他的数字身份。

因此，Calmy 永远不能建立在：

> “只有注册账号的人，才能成为家庭成员。”

这种前提上。

---

# 4. Person 是现实人物锚点，而不是通讯录

Person 不应该只是：

```text
姓名
电话
生日
头像
```

Person 是 Calmy 对现实人物的统一引用点。

例如：

```text
Person：爸爸

基础资料
├── 与我的关系
├── 家庭角色
├── 重要日期
└── 关联账号

与他有关的内容
├── 事情
├── 健康
├── 文件
├── 财务
├── 回忆
├── 联系
├── 礼物
└── 场景
```

但这里必须注意：

> **“与某个人有关”，不等于“属于这个人”。**

比如：

```text
日记：《今天和爸爸吵架》

subject = 爸爸
owner = 我
privacy = Private
```

虽然内容主体是爸爸，但这是我的私人记录。

所以系统必须从一开始区分：

```text
数据主体 Subject

和

数据所有者 Owner
```

否则未来会出现非常危险的问题：

> 关于爸爸的数据，是不是爸爸都有权看？

答案显然不是。

---

# 5. Thing：Calmy 中现实世界的“一件事”

Calmy 前台最重要的现实单位，建议继续使用自然语言：

> **一件事**

Thing 表示：

> 一个值得被面对、理解、选择、推进、处理或复盘的现实对象。

例如：

```text
爸爸住院

准备转行

买一辆车

青岛旅行

装修房子

和小王一起做副业

准备考试
```

Thing 不等于传统任务。

它可以很小：

```text
预约体检
```

也可以持续很久：

```text
转行成为开发工程师
```

甚至可能几年都没有真正“完成”。

Thing 是用户理解现实的基本入口。

---

# 6. Scene：Thing 在现实中展开后的情境

Scene 不再和 Thing 抢夺“这件事”的定义。

更合理的关系应该是：

```text
Thing
现实中的一件事

↓

Scene
这件事在某个阶段形成的现实情境
```

例如：

```text
Thing：
爸爸住院

Scene：
9 月住院治疗
```

或者：

```text
Thing：
准备转行

Scene：
第一阶段：学习 Java
Scene：
第二阶段：投递开发岗位
Scene：
第三阶段：第一次入职开发
```

对于简单事情：

```text
Thing
≈
Scene
```

前台甚至完全不需要让用户感知 Scene。

只有当一件事情变得复杂时，系统内部才需要 Scene。

---

# 7. 为什么仍然需要 Scene

因为现实中的事情经常会同时包含很多不同类型的数据。

例如：

> 爸爸住院。

可能涉及：

```text
爸爸
妈妈
妹妹

医院
医生

检查
健康记录

费用

文件

办理事项

时间安排

沟通

陪护

交通

个人情绪
```

传统 App 会把这些内容拆散：

```text
任务 App
健康 App
财务 App
文件 App
日记 App
日历 App
```

Calmy 应该反过来：

> 从现实中的“这件事”进入，然后看到与它有关的不同数据。

所以：

```text
Thing：爸爸住院

Scene：本次住院

关联：

人物
任务
费用
健康数据
文件
事件
记录
地点
沟通
```

---

# 8. Scene 自己不应该储存业务数据

Scene 只是现实上下文。

它保存：

```text
scene

名称
描述
状态
阶段
参与人物
开始时间
结束时间
关联 Thing
关联 Entity
上下文配置
```

而不应该出现：

```text
scene.health_data
scene.expense
scene.files
scene.tasks
```

否则 Scene 会再次变成数据孤岛。

Scene 应该负责：

> **把不同的数据组织到同一段现实经历中。**

---

# 9. Space：长期存在的关系环境

Space 和 Thing / Scene 不一样。

Space 表示：

> 一群现实中的人长期存在的共同关系环境。

例如：

```text
我的家庭

我和小王

大学室友

创业伙伴

一个长期兴趣小组
```

Space 比 Thing 更稳定，也比 Scene 更长期。

例如：

```text
Space：我的家庭

├── Thing：爸爸住院
├── Thing：春节回家
├── Thing：买新车
├── Thing：妹妹升学
├── Thing：家庭旅行
└── Thing：装修
```

所以可以理解为：

```text
Space
长期关系

Thing
发生的事情

Scene
事情当前展开的情境
```

---

# 10. Space 不是权限边界

这是第二条必须固定的底层原则：

> **Space 是组织边界，不是权限边界。**

例如：

```text
Space：我的家庭
```

里面可能存在：

```text
家庭账单
家庭旅行
共同照片

以及

给爸爸准备生日惊喜
```

虽然生日惊喜也属于家庭生活，但显然不能因为爸爸属于家庭 Space，就自动看到。

因此：

```text
属于某个 Space
≠
Space 所有人自动拥有访问权
```

Space 只回答：

> 这些内容处于什么长期关系背景下？

不直接回答：

> 谁能看？

---

# 11. Scene 不一定属于 Space

例如：

```text
Thing：
准备转行

Scene：
学习 Java
```

这是个人事情，不需要任何 Space。

再例如：

```text
Thing：
和小王一起做副业
```

一开始可能只是临时合作。

如果合作持续两年，系统才可能提示：

> 这已经形成长期关系，是否建立独立空间？

于是：

```text
Thing / Scene
      ↓
逐渐形成
      ↓
Space
```

因此 Space 不应该成为创建事情之前必须选择的东西。

现实先发生。

组织结构之后再出现。

---

# 12. Entity：真正的数据核心

Entity 表示：

> **一个可以独立存在、被关联、被共享、被引用的数据对象。**

例如：

```text
Task / Action
行动事项

Note
笔记

Record
记录

File
文件

Expense
费用

HealthRecord
健康记录

Asset
资产

Location
地点

Event
事件

Memory
回忆

Contact
联系

Goal
目标
```

这些都可以是 Entity。

---

# 13. Thing 和 Entity 不再混在一起

这里需要明确一个重要调整。

以前容易把：

```text
Thing
事情
```

也作为 Entity Type。

但如果 Thing 已经成为系统中的现实对象，就没有必要再次把它作为普通 Entity 类型。

更清晰的是：

```text
Reality Object
├── Person
├── Thing
├── Scene
└── Space

Content Entity
├── Note
├── File
├── Expense
├── HealthRecord
├── Event
├── Action
├── Asset
└── Memory
```

Thing 是现实发生的对象。

Entity 是围绕现实产生的数据。

---

# 14. Domain：必须补上的业务领域层

Entity Type 解决：

> 这是什么类型的数据？

Domain 解决：

> 这份数据属于生活中的什么领域？

例如：

```text
CT 检查报告

EntityType = File
Domain = Health
Subject = 爸爸
Thing = 爸爸住院
Scene = 本次住院
```

再例如：

```text
手术费 3000 元

EntityType = Expense
Domain = Finance

Subject = 爸爸
Thing = 爸爸住院
Scene = 本次住院
```

所以：

```text
File
Expense
Note
Record
```

是数据形态。

而：

```text
Health
Finance
Relationship
Work
Learning
Travel
```

是生活领域。

这两种东西绝对不能混成同一层。

---

# 15. 模块最终是什么

未来用户看到的：

```text
健康
财务
文件
人物
学习
工作
关系
回忆
资产
```

不应该都被理解成独立数据库。

很多所谓“模块”，实际上只是：

```text
Domain
+
Entity
+
Relation
+
View
```

例如健康页面：

```text
Health Domain

查询：

Person = 爸爸
Domain = Health

然后展示：

HealthRecord
File
Event
Note
Expense
Thing
```

所以健康模块不是一个封闭容器。

它是一种：

> **观察现实数据的方式。**

---

# 16. 一个 Entity 可以同时属于多个上下文

例如：

```text
Entity：
CT 检查报告
```

它可以同时关联：

```text
Person：爸爸

Thing：爸爸住院

Scene：9 月住院

Space：我的家庭

Domain：健康

时间：2026 年 9 月
```

但文件只有一份。

不是：

```text
爸爸档案复制一份

住院场景复制一份

健康模块复制一份

家庭空间复制一份
```

而是：

```text
同一个 Entity
+
多个 Relation
```

---

# 17. Relation：系统真正的连接层

Calmy 的关键能力之一，不是建立越来越多模块，而是：

> **让现实对象和数据之间建立关系。**

例如：

```text
CT 报告
→ subject_of
→ 爸爸

CT 报告
→ related_to
→ 爸爸住院

CT 报告
→ used_in
→ 9 月住院 Scene

CT 报告
→ belongs_to_domain
→ Health
```

数据库可以建立统一关系体系：

```text
relation

source_type
source_id

relation_type

target_type
target_id
```

---

# 18. Relation 不能无限自由增长

如果 relation_type 完全自由：

```text
belongs_to
related_to
used_in
attached_to
associated_with
concerns
references
```

几年后关系一定失控。

因此还需要：

```text
RelationDefinition
```

例如：

```text
relation_type:
subject_of

source:
Entity

target:
Person

cardinality:
many-to-many

inverse:
has_related_content
```

系统可以允许扩展关系，但关系本身必须有定义。

---

# 19. Ownership：一份数据到底是谁的

所有 Entity 都应该明确至少四个概念：

```text
created_by
谁创建的

owner
最终属于谁

subject
内容在说谁 / 什么

steward
谁负责管理
```

例如：

```text
妈妈替爸爸记录血压

created_by = 妈妈
subject = 爸爸
owner = 爸爸
steward = 妈妈
```

再例如：

```text
家庭合照

created_by = 我
owner = 家庭 Space
subject = 家庭成员
steward = 我和妹妹
```

因此：

```text
创建者
≠
所有者
≠
数据主体
≠
管理者
```

它们可能相同，但不能假设永远相同。

---

# 20. Participant：现实参与者和数字用户也要分开

Scene 中需要明确 Participant。

例如：

```text
Scene：爸爸住院

Participant：

爸爸
妈妈
妹妹
我
```

其中：

```text
爸爸
Person
未注册

妈妈
Person
未注册

妹妹
Person + User

我
Person + User
```

所以：

```text
Person
↓
SceneParticipant
```

SceneParticipant 可以：

```text
仅现实参与

或者

已经绑定 User，可以真正访问系统
```

一个没有账号的 Person 可以参与现实事情，

但不能因此自动获得数字访问权限。

---

# 21. 共享到底发生在哪里

共享的本质不是：

> 分享页面。

而是：

> **给别人访问某些现实数据的权利。**

用户前台可以看到三种自然操作：

```text
共享一个内容

邀请一起处理一件事

让某个人长期访问某类内容
```

底层最终统一成权限规则。

---

# 22. 第一种：共享单个 Entity

例如：

> 把 CT 报告给妹妹看。

用户看到：

```text
CT检查报告

谁可以看到？

妹妹

权限：
查看
```

底层：

```text
resource = CT报告
principal = 妹妹
permission = View
```

---

# 23. 第二种：共享一个数据范围

例如：

> 妈妈可以查看爸爸的健康资料。

不能要求每产生一条健康记录都重新共享。

所以可以建立：

```text
Scope

Person = 爸爸
Domain = Health
```

然后：

```text
妈妈
View

我
Manage
```

以后爸爸新增：

```text
血压
检查报告
健康记录
```

可以自动落入这个 Scope。

---

# 24. 第三种：邀请一起处理一件事

这是用户最自然的多人行为。

例如：

```text
爸爸住院
```

用户点击：

```text
邀请一起处理
```

选择：

```text
妹妹
```

系统让用户确认：

```text
她可以看到：

✓ 当前安排
✓ 医疗资料
✓ 检查报告
✓ 家庭沟通
✓ 共同记录

不会看到：

✗ 我的私人日记
✗ 我的个人情绪
✗ 私人备注
```

用户理解的是：

> 妹妹加入了这件事。

而底层实际上只是建立了：

```text
Participant
+
Scope
+
Permission
```

---

# 25. 页面共享仍然可以存在

例如：

```text
爸爸住院

[邀请成员]
[分享查看链接]
```

这些完全可以有。

但它们属于：

```text
View / Delivery Layer
```

而不是核心数据模型。

因为：

> 页面会变化，但现实关系、数据所有权和访问权限不能随着页面结构变化。

---

# 26. 私人数据必须是一级概念

系统不能只有：

```text
共享
不共享
```

建议 Entity 默认拥有简单的隐私级别：

```text
Private
只有自己

Restricted
指定人员

Scene
参与这件事的人

Space
空间成员
```

这样可以覆盖绝大多数普通情况。

复杂权限继续留在底层。

---

# 27. 共同场景中必须允许私人层存在

例如一家人旅行。

共同数据：

```text
酒店
行程
车票
公共预算
共同照片
共同事项
景点
```

我的私人数据：

```text
旅行日记
个人消费备注
个人感受
私人收藏
```

它们都可以出现在：

```text
青岛旅行
```

但权限完全不同。

因此：

```text
Thing / Scene
=
共同现实

而不是
=
所有数据公开
```

Scene 应该天然支持：

```text
共同层
+
个人层
```

---

# 28. 权限第一版只需要四级

第一版：

```text
View
查看

Comment
评论 / 回复

Edit
修改业务内容

Manage
删除 / 分享 / 管理成员
```

不要第一版就设计几十种权限。

复杂权限必须隐藏在系统内部。

---

# 29. 权限规则

权限不能只说：

> 越具体优先。

还需要明确允许与禁止发生冲突时怎么办。

建议：

```text
Explicit Deny
明确禁止

>

Explicit Allow
明确允许

>

Inherited Allow
继承允许

>

Default Deny
默认禁止
```

同时在不同层级：

```text
Entity
>
Scope
>
Scene
>
Space
```

例如：

```text
家庭 Space
默认成员可以看

爸爸住院 Scene
成员可以看医疗资料

某一条 Note
明确禁止爸爸访问
```

最终爸爸不能看到。

---

# 30. 权限系统必须能够解释原因

未来系统不应该只返回：

```text
true / false
```

而应该能够回答：

```text
为什么妹妹能看到这条数据？

因为：

妹妹
→ 是爸爸住院的 Participant
→ 获得医疗资料 Scope 的 View 权限
```

或者：

```text
为什么爸爸看不到？

因为：

Entity 本身明确设置为 Private
```

这对长期维护、排错和用户信任都非常重要。

---

# 31. Scene 生命周期

Scene 可以有：

```text
Draft
准备

Active
进行中

Paused
暂缓

Completed
完成

Archived
归档
```

例如：

```text
青岛旅行

8 月：
Draft

9 月 1 日：
Active

9 月 5 日：
Completed

之后：
Archived
```

---

# 32. Thing 生命周期可以比 Scene 更长

例如：

```text
Thing：
准备转行
```

可能持续两年。

下面有：

```text
Scene 1：
系统学习 Java

Scene 2：
准备作品集

Scene 3：
开始求职

Scene 4：
第一份开发工作
```

因此：

```text
Thing
是长期现实主线

Scene
是阶段性上下文
```

---

# 33. Scene 完成以后数据不能消失

这是一个必须固定的原则：

> **Scene 结束，只意味着情境结束，不意味着数据被删除。**

例如旅行完成：

```text
Scene：
青岛旅行

→ Archived
```

但其中数据仍然存在：

```text
照片
→ Memory

消费
→ Finance

地点
→ Location

旅行记录
→ Note / Record

人物互动
→ Relationship History
```

所以：

```text
Scene 生命周期有限

Entity 生命周期独立
```

---

# 34. “留下”应该成为正式系统机制

Calmy 一直强调：

```text
世界进入
↓
看见
↓
理解
↓
预见
↓
选择
↓
去做
↓
回来
↓
留下
↓
再进入
```

其中：

> **留下**

不能只是一句产品理念。

它应该成为真正的 Settlement / 沉淀机制。

当一个 Thing / Scene 完成时：

```text
这件事结束了。

有什么值得留下？
```

系统可以整理：

```text
健康档案

重要文件

费用记录

人物关系变化

值得保存的照片

重要时间

经验与复盘

未来还会用到的信息
```

这一步不是复制数据。

而是重新建立长期关系。

---

# 35. 人离开关系以后怎么办

例如情侣分手。

原来：

```text
Space：
我和小王
```

里面有：

```text
共同旅行
共同账单
共同照片
共同事件
私人记录
```

分手后绝不能：

```text
删除 Space
→ 全部消失
```

更合理的是：

```text
Space
→ Closed
```

然后：

```text
我的私人数据
→ 我继续拥有

对方私人数据
→ 我失去访问权

共同数据
→ 按原所有权规则处理
```

因此：

> 关系结束和数据删除是两件完全不同的事情。

---

# 36. View：同一个现实，每个人看到不同视角

例如：

```text
Thing：
爸爸住院
```

我看到：

```text
当前情况
爸爸状态
检查结果
需要处理
家庭沟通
费用
我的记录
我的情绪
```

妹妹看到：

```text
当前情况
爸爸状态
检查结果
她需要处理的事情
家庭沟通
```

爸爸本人看到：

```text
我的住院
今日安排
检查结果
医生建议
家人留言
```

三个人面对的是：

```text
同一个 Thing
同一个 Scene
同一批 Entity
```

但：

```text
View 不一样
```

所以：

> **共同现实只有一个，但每个人面对现实的视角不同。**

---

# 37. 数据还必须拥有来源和历史

多人系统不能只有最终状态。

每个 Entity 至少应该留下：

```text
created_at

created_by

updated_at

updated_by

source

version

history
```

例如：

```text
血压 135 / 90
```

未来需要知道：

```text
谁录入的？

什么时候？

原始值是什么？

是否被修改过？

修改者是谁？
```

因此长期可以形成：

```text
Entity
↓
EntityVersion
↓
Activity / Event
```

前台不一定展示“审计日志”。

但底层必须有历史能力。

---

# 38. 一个完整案例

假设：

> 爸爸突然住院。

首先创建：

```text
Thing：
爸爸住院
```

系统建立当前：

```text
Scene：
9 月住院治疗
```

加入人物：

```text
爸爸
妈妈
妹妹
我
```

系统关联：

```text
Person
Hospital
Doctor
HealthRecord
File
Expense
Action
Event
Note
```

例如：

```text
CT检查报告

EntityType = File
Domain = Health
Subject = 爸爸
Thing = 爸爸住院
Scene = 9月住院
Owner = 爸爸
```

我邀请妹妹：

```text
邀请一起处理
```

妹妹得到：

```text
SceneParticipant
+
相应 Scope 权限
```

她可以看到：

```text
共同事项
健康资料
检查报告
医生要求
家庭沟通
```

而我写：

```text
“今天突然意识到爸爸真的老了。”
```

它属于：

```text
EntityType = Note
Owner = 我
Privacy = Private
```

所以妹妹看不到。

---

住院结束：

```text
Scene：
9月住院

→ Completed
```

系统进入：

```text
回来 / 留下
```

提示：

```text
这件事结束了。

建议留下：

✓ 健康档案
✓ 检查报告
✓ 医疗费用
✓ 医生注意事项
✓ 重要时间
✓ 家庭记录
```

Scene 最终 Archived。

但这些 Entity 仍然继续存在。

下一次爸爸再次看病时：

```text
历史检查报告
健康记录
过敏信息
医生建议
```

又会重新进入新的现实情境。

这才真正形成：

```text
现实
→ 数据
→ 沉淀
→ 再进入现实
```

---

# 39. 前台不要出现复杂技术名词

用户不需要看到：

```text
Entity
Scope
Principal
Grant
RelationDefinition
Ownership
SceneParticipant
```

用户只需要看到：

```text
人

这件事

和谁一起

相关内容

谁可以看到

这是我的还是我们的

这件事结束后留下什么
```

因此：

> **底层可以非常严谨，前台必须极其自然。**

---

# 40. 第一阶段 MVP

第一版不要把所有能力开发完。

首先只开发：

```text
Person

Thing

简单 Scene

Entity

EntityRelation

Participant

Private / Shared

基础权限

基础 Domain
```

Space 先保留基本结构。

Scope 先支持最简单范围。

复杂权限继承、共同所有权、关系结束等以后再扩展。

---

# 41. MVP 用户真正看到什么

首页：

```text
今天

事情

人

记录
```

进入：

```text
爸爸住院
```

看到：

```text
参与的人

当前情况

待处理

相关内容

记录

文件

时间

[邀请一起处理]
```

新增内容时：

```text
谁可以看到？

● 只有我

○ 参与这件事的人

○ 指定的人
```

对于绝大多数用户来说，这已经足够。

---

# 42. 最终的数据组织方式

Calmy 最终不应该变成：

```text
任务 App

日记 App

健康 App

财务 App

人物 App

文件 App

资产 App

旅行 App
```

然后把这些 App 拼在一起。

真正结构应该是：

```text
现实中的人
Person

        ↓

现实中的事情
Thing

        ↓

形成阶段性情境
Scene

        ↓

产生各种真实数据
Entity

        ↓

数据具有生活领域
Domain

        ↓

数据与人物 / 事情 / 场景 / 空间 / 时间建立关系
Relation

        ↓

确定归属
Ownership

        ↓

根据关系决定访问
Permission

        ↓

根据使用者生成页面
View

        ↓

事情结束

        ↓

有价值的信息沉淀

        ↓

再次进入新的现实
```

---

# 43. 最终应该正式确定的十二条原则

1. **User 和 Person 永远分离。**

2. **Person 表示现实人物，账号只是人物的数字身份。**

3. **Thing 是用户理解现实的核心单位。**

4. **Scene 是 Thing 在某一阶段形成的现实情境，而不是另一种“事情”。**

5. **Space 表示长期关系环境，不代表所有成员自动拥有数据权限。**

6. **Entity 是现实过程中产生的数据，而不是现实事情本身。**

7. **Entity Type 和 Domain 必须分开：一个说明数据是什么，一个说明它属于哪个生活领域。**

8. **同一 Entity 可以关联 Person / Thing / Scene / Space / Domain / Time，但数据本身只有一份。**

9. **数据必须区分创建者、所有者、主体和管理者。**

10. **共同现实中允许共同数据和私人数据同时存在。**

11. **Thing / Scene 结束不会销毁数据，有价值的信息应该继续沉淀。**

12. **底层模型可以复杂，但用户只应该面对自然语言和现实概念。**

---

# 44. 接下来真正应该继续设计什么

现在还不应该立刻去设计：

```text
家庭页面

健康页面

财务页面

旅行页面
```

应该按照以下顺序继续。

## 第一阶段：核心对象关系

彻底画清：

```text
Person

Thing

Scene

Space

Entity

Domain
```

之间的关系。

---

## 第二阶段：模块关系

明确：

```text
健康

财务

文件

记录

任务

资产

回忆

关系

学习

工作
```

分别属于：

```text
Entity Type

Domain

View

还是独立 Reality Object
```

避免以后每个模块重新造数据模型。

---

## 第三阶段：Relation

设计：

```text
哪些对象可以建立关系

关系有哪些类型

关系方向

关系约束

反向关系

一对一 / 一对多 / 多对多
```

---

## 第四阶段：Ownership

设计：

```text
Created By

Owner

Subject

Steward
```

以及：

```text
个人所有

共同所有

Space 所有

组织所有
```

---

## 第五阶段：Permission

设计：

```text
Entity Permission

Scope Permission

Scene Permission

Space Default

Allow / Deny

继承规则
```

---

## 第六阶段：Lifecycle

完整设计：

```text
事情出现

↓

形成 Scene

↓

参与

↓

产生数据

↓

共同处理

↓

完成

↓

回来

↓

沉淀

↓

归档

↓

未来再次被调用
```

---

## 第七阶段：View

最后再解决：

```text
同一份现实数据

如何针对：

不同的人

不同场景

不同领域

不同设备

不同任务

形成不同页面
```

完成这些以后，再进入真正的数据库设计和 UI 设计。

---

# 45. 最终核心

Calmy 真正要建立的，不是一堆功能模块。

它要建立的是：

> **一个能够表达“人正在经历什么、与谁一起经历、过程中产生了什么、这些东西属于谁、谁能看到，以及事情结束以后什么值得留下”的现实数据系统。**

因此 Calmy 的底层不是：

```text
Todo
+
Note
+
Finance
+
Health
+
File
```

而是：

```text
人
+
事情
+
关系
+
现实数据
+
时间
+
权限
+
沉淀
```

最终所有模块，都只是对这套现实结构的不同观察方式。