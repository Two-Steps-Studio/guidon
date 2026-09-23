<#
.SYNOPSIS
    Copies the GuidonTasks plugin into an Unreal Engine project and checks
    the preconditions Unreal needs to compile it (a C++-enabled project).

.PARAMETER ProjectPath
    Path to the target project - either the folder itself or its .uproject file.

.EXAMPLE
    ./install.ps1 -ProjectPath "C:\Users\Marcin\Documents\Unreal Projects\MyGame"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath
)

$ErrorActionPreference = "Stop"

$sourceDir = $PSScriptRoot

# Accept either the project folder or a direct path to the .uproject file.
if (Test-Path $ProjectPath -PathType Leaf) {
    if ($ProjectPath -notmatch '\.uproject$') {
        Write-Error "ProjectPath points to a file that isn't a .uproject: $ProjectPath"
        exit 1
    }
    $projectDir = Split-Path -Parent $ProjectPath
    $uprojectFile = $ProjectPath
} else {
    $projectDir = $ProjectPath
    $uprojectFiles = Get-ChildItem -Path $projectDir -Filter "*.uproject" -File -ErrorAction SilentlyContinue
    if (-not $uprojectFiles) {
        Write-Error "No .uproject file found in $projectDir - pass the project folder or the .uproject file directly."
        exit 1
    }
    $uprojectFile = $uprojectFiles[0].FullName
}

Write-Host "Target project: $uprojectFile" -ForegroundColor Cyan

$pluginsDir = Join-Path $projectDir "Plugins"
$destDir = Join-Path $pluginsDir "GuidonTasks"

if (Test-Path $destDir) {
    Write-Host "Removing existing $destDir before copying the new version..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $destDir
}

New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
Write-Host "Copying plugin files..." -ForegroundColor Cyan
Copy-Item -Recurse -Path $sourceDir -Destination $destDir -Force

# install.ps1 itself doesn't need to ship inside the installed copy.
$copiedScript = Join-Path $destDir "install.ps1"
if (Test-Path $copiedScript) {
    Remove-Item -Force $copiedScript
}

Write-Host "Plugin copied to: $destDir" -ForegroundColor Green

$sourceDirInProject = Join-Path $projectDir "Source"
$hasSource = Test-Path $sourceDirInProject

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan

if (-not $hasSource) {
    Write-Host "  1. Your project has no Source/ folder yet (it's Blueprint-only)." -ForegroundColor Yellow
    Write-Host "     In the Unreal Editor: Tools -> New C++ Class... -> base class 'None' -> Create Class."
    Write-Host "     This adds a C++ module to your project, which is required to build any C++ plugin."
    Write-Host "  2. Right-click your .uproject -> Generate Visual Studio project files."
    Write-Host "  3. Reopen the project. When prompted to rebuild missing modules, click Yes."
} else {
    Write-Host "  1. Right-click your .uproject -> Generate Visual Studio project files."
    Write-Host "  2. Reopen the project. When prompted to rebuild missing modules, click Yes."
}

Write-Host ""
Write-Host "If the rebuild prompt lists OTHER modules failing alongside GuidonTasks," -ForegroundColor Cyan
Write-Host "those are unrelated to this plugin - see the Troubleshooting section in README.md."
