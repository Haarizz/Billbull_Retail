' Launches the BillBull POS print agent silently (no console window) using the
' Node.js install on PATH. Safe to run at Windows logon — reads tray.js from
' whatever folder this .vbs file itself lives in, so it works unmodified on any
' workstation the pos-print-agent folder is copied to.
'
' Runs tray.js (not server.js) so the running agent still shows a system tray
' icon (status + Quit) even though the console window is hidden — without this,
' closing the invoking window/session would look like the agent silently died
' with no way for staff to tell it's still running or to stop it.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
shell.Run "cmd /c node tray.js >> agent.log 2>&1", 0, False
