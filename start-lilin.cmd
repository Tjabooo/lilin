@echo off
rem Runs Lilin and restarts it if it exits. Output is appended to logs\lilin.log.
rem An empty .lilin-stopped file in this folder keeps Lilin stopped (the task's 2-minute trigger too).
cd /d "%~dp0"
if exist ".lilin-stopped" exit /b 0
if not exist logs mkdir logs
rem Streams, probes and copies all read files through Node's thread pool (4 threads by default): give it more.
if not defined UV_THREADPOOL_SIZE set UV_THREADPOOL_SIZE=16
:loop
if exist ".lilin-stopped" exit /b 0
echo [%date% %time%] starting Lilin>> "logs\lilin.log"
node server.js >> "logs\lilin.log" 2>&1
echo [%date% %time%] Lilin stopped, restarting in 5 seconds>> "logs\lilin.log"
timeout /t 5 /nobreak > nul
goto loop
