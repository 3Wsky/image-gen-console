# 本地辅助脚本：提交并推送 image-gen-console 到 GitHub
# 服务器部署请看 DEPLOY_1GO.md

$ErrorActionPreference = 'Stop'

git status
Write-Host "\n如果确认只提交部署相关文件，请手动执行：" -ForegroundColor Yellow
Write-Host "git add DEPLOY_1GO.md deploy-1go.ps1" -ForegroundColor Cyan
Write-Host "git commit -m \"docs: add 1go deployment guide\"" -ForegroundColor Cyan
Write-Host "git push origin master" -ForegroundColor Cyan
