@echo off
setlocal

set "folder=%~dp0"

for /r "%folder%" %%a in (*.js *.html *.css) do (
    echo Processing "%%a"...
    if "%%~xa" == ".js" (
        if not "%%~dpa" == "%folder%.history\" (
            @REM echo -------JS-------
            uglifyjs "%%a" --comments all -c -m -o "%%a"
        )
    ) else if "%%~xa" == ".html" (
        if not "%%~dpa" == "%folder%.history\" (
            @REM echo -------HTML-------
            html-minifier --collapse-whitespace --remove-comments --remove-optional-tags --remove-redundant-attributes --minify-css true --minify-js true "%%a" -o "%%a"
        )
    ) else if "%%~xa" == ".css" (
        if not "%%~dpa" == "%folder%.history\" (
            @REM echo -------CSS-------
            cleancss -o "%%a" "%%a"
        )
    )
)

echo Done.
pause
