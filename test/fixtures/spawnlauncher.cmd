@ECHO OFF
if "x%~1" == "x" goto execute
set CMD_LINE_ARGS=%*
:execute
node echo.js %CMD_LINE_ARGS%
