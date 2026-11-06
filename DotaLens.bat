@echo off
rem DotaLens - Dota 2 stats desktop app (Microsoft Edge app window)
set "APPFILE=%~dp0app\index.html"
set "APPURL=file:///%APPFILE:\=/%"
start "" msedge --app="%APPURL%" --window-size=1400,900
