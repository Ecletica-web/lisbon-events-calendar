# GitHub Repository Setup Script
# Run this after creating your repository on GitHub

Write-Host "=== GitHub Repository Setup ===" -ForegroundColor Cyan
Write-Host ""

# Prompt for GitHub username
$username = Read-Host "Enter your GitHub username"

# Prompt for repository name
$repoName = Read-Host "Enter your repository name (e.g., lisbon-events-calendar)"

# Set branch to main
Write-Host "`nSetting branch to main..." -ForegroundColor Yellow
git branch -M main

# Add remote
Write-Host "Adding remote origin..." -ForegroundColor Yellow
git remote add origin "https://github.com/$username/$repoName.git"

# Show remote
Write-Host "`nRemote configured:" -ForegroundColor Green
git remote -v

Write-Host "`n=== Ready to push ===" -ForegroundColor Cyan
Write-Host "Run: git push -u origin main" -ForegroundColor Yellow
Write-Host "Or press Enter to push now..." -ForegroundColor Yellow
$null = Read-Host

# Push to GitHub
Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

Write-Host "`n=== Done! ===" -ForegroundColor Green
Write-Host "Your repository is now on GitHub!" -ForegroundColor Green
Write-Host "View it at: https://github.com/$username/$repoName" -ForegroundColor Cyan
