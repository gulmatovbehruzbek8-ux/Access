@echo off
set "SOURCE=%USERPROFILE%\OneDrive\Documents\Terra"
set "DEST=%USERPROFILE%\OneDrive\Desktop\project\Terra.zip"

if not exist "%SOURCE%\" (
    echo Error: Terra folder not found at %SOURCE%
    exit
)

echo Zipping %SOURCE% ...
powershell -NoProfile -Command "Compress-Archive -Path '%SOURCE%' -DestinationPath '%DEST%' -Force"

echo Done. Created %DEST%