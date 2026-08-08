@echo off
where node >nul 2>nul || (echo Node.js 22+ is required. & exit /b 1)
where ffmpeg >nul 2>nul || echo Warning: ffmpeg not found. Timeline MP4 export will be unavailable.
cd /d %~dp0
node standalone\server.mjs
