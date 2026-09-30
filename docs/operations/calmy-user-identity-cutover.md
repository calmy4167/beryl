# Calmy 用户系统首次部署与切换

## 部署前

1. 在 Cloudflare 项目中确认 Worker 绑定名为 `BERYL_D1`，数据库名为 `beryl-d1`。
2. 从 `backend` 目录应用 D1 迁移：

   ```powershell
   npx wrangler d1 migrations apply beryl-d1 --remote
   ```

   `0002_system_administration.sql` 增加系统角色、安全策略和审计所需的身份元数据列。先备份数据库，再迁移；迁移必须先于新 Worker 部署。详细本地和回滚说明见[系统管理模块运行说明](calmy-system-administration.md)。

3. 设置一次性管理员初始化密钥。命令会交互式读取密钥；不要把真实值写进仓库、终端日志或文档：

   ```powershell
   npx wrangler secret put CALMY_BOOTSTRAP_SECRET
   ```

4. 部署 Worker 和前端。前端构建时设置 `VITE_API_BASE_URL` 为 Worker 的 HTTPS 地址；如果未设置，登录页会要求用户输入服务地址。

## 创建首位管理员

为 Calmy 生成一组高强度初始化密钥和管理员登录密码。两者用途不同：初始化密钥只调用一次接口，管理员密码用于日常登录。PowerShell 示例：

```powershell
$worker = 'https://你的-worker.example.workers.dev'
$bootstrapSecret = Read-Host '输入 CALMY_BOOTSTRAP_SECRET' -AsSecureString
$secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapSecret)
try { $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr) }
$adminPassword = Read-Host '设置管理员登录密码（至少 6 位；遵循当前后台密码策略）' -AsSecureString
$adminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr) }
$body = @{ username = 'admin'; displayName = '系统管理员'; password = $password } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$worker/api/auth/bootstrap" -Headers @{ Authorization = "Bearer $secret" } -ContentType 'application/json' -Body $body
Remove-Variable secret, password, body, bootstrapSecret, adminPassword
```

接口只允许在没有任何用户时创建管理员。成功后立刻删除初始化密钥：

```powershell
npx wrangler secret delete CALMY_BOOTSTRAP_SECRET
```

登录 Calmy 后，在“系统管理 → 用户管理”创建其他用户。系统生成的临时密码仅显示一次；通过安全渠道交给用户，用户首次登录后必须修改。系统角色用于管理后台功能，不影响用户对其他账号 Vault 的访问。

## Vault 首次启用与新设备

每个用户首次登录时，浏览器本地生成随机 User Key 和独立 Recovery Key。服务器只收到用 Recovery Key 加密的 User Key 包裹，不会收到 Recovery Key。首次启用页要求用户下载或抄录恢复包并确认已保存。

新设备登录时需要恢复密钥。丢失所有已解锁设备和恢复包后，服务器管理员也不能恢复用户内容。登录密码重置只恢复账号访问，不会解密或重置 Vault。

## 现有数据

升级前的 D1 全局 `records`、`entity_records`、`auth` 表会保留。创建首位管理员后旧的全局同步接口会拒绝请求。浏览器旧数据可在“设置 → 旧设备本地数据”中查看集合数量，下载由当前 Vault User Key 加密的备份并确认归属后合并到当前管理员账号。恢复备份需要该账号的 Vault 恢复包；迁移流程不会清除浏览器旧数据。

旧版 D1 全局数据迁移入口位于“设置 → 旧版云端数据迁移”。向导会先把每条记录（包括键名和实体 ID）用当前 User Key 加密后下载，并在本机解密预览旧 SharedSpace 成员、Space 人物成员、SceneParticipant、Person 账号关联、Permission 主体及 Ownership User 引用。旧 ID 只作为业务数据迁移，不会自动绑定新账号或创建访问授权。迁移时旧同步密码只在浏览器本地解密；新 Vault 密文经过目标端逐条解密核对后，Worker 才会原子清理旧表记录。只有首位管理员可以执行；忘记旧同步密码或预览发现暂不支持的数据键时，旧 D1 数据会继续保留。不要手动调用 `/api/admin/legacy/complete`。

迁移备份使用当前 Vault User Key 加密，文件不包含明文键名或实体 ID，恢复需要该账号的恢复包。备份元数据标注 30 天回滚期限；完成迁移确认后，应在期限结束时删除本机备份。服务器不保留这份备份副本。

实施数据迁移前先创建 D1 备份，并确认本机旧数据仍可单独导出。不要把旧同步密码当作登录密码或 Vault 恢复密钥。
