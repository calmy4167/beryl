[CmdletBinding()]
param(
    [ValidateSet('Auto', 'Status', 'MasterToModules', 'ModulesToMaster', 'Watch')]
    [string]$Mode = 'Auto',

    [switch]$Force,

    [ValidateRange(1, 60)]
    [int]$IntervalSeconds = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$syncDirectory = Split-Path -Parent $PSCommandPath
$calmyRoot = Split-Path -Parent $syncDirectory
$configPath = Join-Path $syncDirectory '同步配置.json'
$statePath = Join-Path $syncDirectory '.同步状态.json'
$conflictPath = Join-Path $syncDirectory '同步冲突.md'

function Normalize-Newlines {
    param([string]$Text)
    return (($Text -replace "`r`n", "`n") -replace "`r", "`n")
}

function Read-Utf8Text {
    param([string]$Path)
    return Normalize-Newlines ([System.IO.File]::ReadAllText($Path))
}

function Write-Utf8Text {
    param(
        [string]$Path,
        [string]$Text
    )

    $directory = Split-Path -Parent $Path
    if ($directory -and -not (Test-Path -LiteralPath $directory -PathType Container)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, (Normalize-Newlines $Text), $utf8WithoutBom)
}

function Get-FileSha256 {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '')
    }
    finally {
        $sha.Dispose()
    }
}

function Remove-TrailingDivider {
    param([string]$Text)

    $clean = (Normalize-Newlines $Text).Trim()
    $clean = [System.Text.RegularExpressions.Regex]::Replace($clean, "(?s)\n---\s*$", '')
    return $clean.TrimEnd()
}

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "未找到同步配置：$configPath"
}

$config = Read-Utf8Text $configPath | ConvertFrom-Json
$masterPath = Join-Path $calmyRoot $config.master
$sections = @($config.sections)

function Get-ModulePath {
    param($Section)
    return Join-Path $calmyRoot ([string]$Section.path)
}

function Write-SyncState {
    $moduleHashes = [ordered]@{}
    foreach ($section in $sections) {
        $moduleHashes[[string]$section.id] = Get-FileSha256 (Get-ModulePath $section)
    }

    $state = [ordered]@{
        version      = 1
        lastSync     = [DateTimeOffset]::Now.ToString('o')
        masterHash   = Get-FileSha256 $masterPath
        moduleHashes = $moduleHashes
    }

    Write-Utf8Text $statePath (($state | ConvertTo-Json -Depth 8) + "`n")
    if (Test-Path -LiteralPath $conflictPath -PathType Leaf) {
        Remove-Item -LiteralPath $conflictPath -Force
    }
}

function Get-SyncState {
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        return $null
    }
    return (Read-Utf8Text $statePath | ConvertFrom-Json)
}

function Get-SavedModuleHash {
    param(
        $State,
        [string]$Id
    )

    if ($null -eq $State -or $null -eq $State.moduleHashes) {
        return $null
    }

    $property = $State.moduleHashes.PSObject.Properties[$Id]
    if ($null -eq $property) {
        return $null
    }
    return [string]$property.Value
}

function Get-ChangeStatus {
    $state = Get-SyncState
    if ($null -eq $state) {
        return [pscustomobject]@{
            StateMissing   = $true
            MasterChanged  = $true
            ChangedModules = @()
        }
    }

    $masterChanged = (Get-FileSha256 $masterPath) -ne [string]$state.masterHash
    $changedModules = @()
    foreach ($section in $sections) {
        $id = [string]$section.id
        $current = Get-FileSha256 (Get-ModulePath $section)
        $saved = Get-SavedModuleHash $state $id
        if ($current -ne $saved) {
            $changedModules += $section
        }
    }

    return [pscustomobject]@{
        StateMissing   = $false
        MasterChanged  = $masterChanged
        ChangedModules = @($changedModules)
    }
}

function Split-MasterToModules {
    if (-not (Test-Path -LiteralPath $masterPath -PathType Leaf)) {
        throw "总文档不存在：$masterPath"
    }

    $masterText = Read-Utf8Text $masterPath
    $contentSections = @($sections | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.heading) })
    $positions = @()

    foreach ($section in $contentSections) {
        $heading = [string]$section.heading
        $position = $masterText.IndexOf($heading, [System.StringComparison]::Ordinal)
        if ($position -lt 0) {
            throw "总文档中缺少章节边界：$heading"
        }
        $positions += $position
    }

    for ($index = 1; $index -lt $positions.Count; $index++) {
        if ($positions[$index] -le $positions[$index - 1]) {
            throw '总文档章节顺序与同步配置不一致。'
        }
    }

    for ($index = 0; $index -lt $sections.Count; $index++) {
        if ($index -eq 0) {
            $start = 0
            $end = $positions[0]
        }
        else {
            $start = $positions[$index - 1]
            if ($index -lt ($sections.Count - 1)) {
                $end = $positions[$index]
            }
            else {
                $end = $masterText.Length
            }
        }

        $length = $end - $start
        $sectionText = Remove-TrailingDivider $masterText.Substring($start, $length)
        Write-Utf8Text (Get-ModulePath $sections[$index]) ($sectionText + "`n")
    }

    Write-SyncState
    Write-Host '已将总文档拆分并同步到全部模块。'
}

function Build-MasterFromModules {
    $parts = @()
    foreach ($section in $sections) {
        $modulePath = Get-ModulePath $section
        if (-not (Test-Path -LiteralPath $modulePath -PathType Leaf)) {
            throw "模块文档不存在：$modulePath"
        }
        $parts += (Read-Utf8Text $modulePath).Trim()
    }

    $separator = "`n`n---`n`n"
    $masterText = ($parts -join $separator) + "`n"
    Write-Utf8Text $masterPath $masterText
    Write-SyncState
    Write-Host '已将全部模块合并并同步回总文档。'
}

function Write-ConflictReport {
    param($Status)

    $changed = @($Status.ChangedModules | ForEach-Object { "- ``$($_.path)``" }) -join "`n"
    $report = @"
# Calmy 文档同步冲突

检测时间：$([DateTimeOffset]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz'))

总文档和模块文档自上次同步后都发生了修改。为避免覆盖，自动同步已经停止。

发生变化的模块：

$changed

处理方式：比较总文档与上述模块，保留正确内容后，再明确运行以下命令之一：

- 以总文档为准：``.\Calmy-文档同步.ps1 -Mode MasterToModules -Force``
- 以模块为准：``.\Calmy-文档同步.ps1 -Mode ModulesToMaster -Force``
"@
    Write-Utf8Text $conflictPath ($report.Trim() + "`n")
}

function Show-Status {
    $status = Get-ChangeStatus
    Write-Host "文档库：$calmyRoot"
    Write-Host "总文档：$masterPath"

    if ($status.StateMissing) {
        Write-Host '状态：尚未建立同步基线'
        return
    }

    Write-Host ("总文档变更：" + $(if ($status.MasterChanged) { '是' } else { '否' }))
    if ($status.ChangedModules.Count -eq 0) {
        Write-Host '模块变更：无'
    }
    else {
        Write-Host '模块变更：'
        foreach ($section in $status.ChangedModules) {
            Write-Host "  - $($section.path)"
        }
    }
}

function Invoke-AutoSync {
    $status = Get-ChangeStatus

    if ($status.StateMissing) {
        Split-MasterToModules
        return
    }

    $modulesChanged = $status.ChangedModules.Count -gt 0
    if ($status.MasterChanged -and $modulesChanged) {
        Write-ConflictReport $status
        throw "总文档与模块均有未同步修改。已生成冲突报告：$conflictPath"
    }

    if ($status.MasterChanged) {
        Split-MasterToModules
        return
    }

    if ($modulesChanged) {
        Build-MasterFromModules
        return
    }

    Write-Host '文档已同步，无需变更。'
}

switch ($Mode) {
    'Status' {
        Show-Status
    }
    'MasterToModules' {
        $status = Get-ChangeStatus
        if (-not $Force -and $status.ChangedModules.Count -gt 0) {
            throw '模块存在未同步修改。若确认覆盖，请增加 -Force。'
        }
        Split-MasterToModules
    }
    'ModulesToMaster' {
        $status = Get-ChangeStatus
        if (-not $Force -and $status.MasterChanged) {
            throw '总文档存在未同步修改。若确认覆盖，请增加 -Force。'
        }
        Build-MasterFromModules
    }
    'Watch' {
        Write-Host "正在监视文档变化；检测间隔 $IntervalSeconds 秒。按 Ctrl+C 停止。"
        while ($true) {
            try {
                Invoke-AutoSync
            }
            catch {
                Write-Warning $_.Exception.Message
            }
            Start-Sleep -Seconds $IntervalSeconds
        }
    }
    default {
        Invoke-AutoSync
    }
}
