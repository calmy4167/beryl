import { WorkspaceSourceBar } from '../feishu-workspace'
import { FeishuBoardView } from '../FeishuWorkspaceViews'

export function FeishuPage() {
  return <><WorkspaceSourceBar forcedFeishu /><FeishuBoardView allTables /></>
}
