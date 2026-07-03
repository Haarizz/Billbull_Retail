; BillBull POS Print Agent — Inno Setup installer script
; Compile with Inno Setup 6 (https://jrsoftware.org/isinfo.php):
;   iscc installer\BillBullPrintAgent.iss
; Produces installer\output\BillBullPrintAgentSetup.exe
;
; Prerequisite: run `npm run build` first so dist\BillBullPrintAgent.exe exists.

#define MyAppName "BillBull Print Agent"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "BillBull"
#define MyAppExeName "BillBullPrintAgent.exe"

[Setup]
AppId={{8B1A81FA-7BFD-4267-9862-88A6FF7EC059}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; No admin rights required to install — this is a per-user tool that a cashier
; or store manager should be able to install without IT elevating them, and it
; only needs to autostart for the account that's actually running the till.
PrivilegesRequired=lowest
DefaultDirName={userpf}\BillBull\PrintAgent
OutputDir=output
OutputBaseFilename=BillBullPrintAgentSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start {#MyAppName} automatically when Windows starts"; GroupDescription: "Startup:"; Flags: checkedonce

[Files]
Source: "..\dist\BillBullPrintAgent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: autostart

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Best-effort stop of a running agent before files are removed, so the
; uninstaller doesn't leave a locked/orphaned BillBullPrintAgent.exe behind.
; taskkill exits non-zero when there's nothing to kill (or on a race losing to
; the process already exiting) — "& exit 0" keeps that from failing the
; uninstall itself, and the timeout gives the OS a moment to release the file
; handle before Inno tries to delete the exe.
Filename: "{cmd}"; Parameters: "/C taskkill /IM {#MyAppExeName} /F & timeout /T 1 /NOBREAK & exit 0"; Flags: runhidden; RunOnceId: "StopAgent"
