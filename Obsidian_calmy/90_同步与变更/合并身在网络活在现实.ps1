[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MasterPath,

    [Parameter(Mandatory = $true)]
    [string]$SourcePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$master = [System.IO.Path]::GetFullPath($MasterPath)
$source = [System.IO.Path]::GetFullPath($SourcePath)
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $master -PathType Leaf)) {
    throw "总文档不存在：$master"
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "外部材料不存在：$source"
}

$masterText = ([System.IO.File]::ReadAllText($master) -replace "`r`n", "`n" -replace "`r", "`n")
$sourceText = ([System.IO.File]::ReadAllText($source) -replace "`r`n", "`n" -replace "`r", "`n").Trim()
$heading = '# 九、身在网络，活在现实：AI时代的 Calmy 核心设计母本'

if ($masterText.Contains($heading)) {
    Write-Host '总文档中已经存在该章节，未重复合并。'
    exit 0
}

$tocAnchor = '8. [不限于软件的产品设计改进](#八、不限于软件的产品设计改进)'
if (-not $masterText.Contains($tocAnchor)) {
    throw "总文档中未找到目录锚点：$tocAnchor"
}

$masterText = $masterText.Replace(
    $tocAnchor,
    $tocAnchor + "`n9. [身在网络，活在现实：AI时代的 Calmy 核心设计母本](#九、身在网络活在现实ai时代的-calmy-核心设计母本)"
)

$addition = "`n`n---`n`n" + $heading + "`n`n" + $sourceText + "`n"
$finalText = $masterText.TrimEnd() + $addition
[System.IO.File]::WriteAllText($master, $finalText, $utf8WithoutBom)
Write-Host '已将外部总纲完整合并到总文档。'
