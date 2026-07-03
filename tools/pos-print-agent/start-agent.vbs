' Launches the BillBull POS print agent silently (no console window) using the
' Node.js install on PATH. Safe to run at Windows logon — reads server.mjs from
' whatever folder this .vbs file itself lives in, so it works unmodified on any
' workstation the pos-print-agent folder is copied to.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
shell.Run "cmd /c node server.mjs >> agent.log 2>&1", 0, False
