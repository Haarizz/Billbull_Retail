; BillBull POS Print Agent — Inno Setup installer script
; Compile with Inno Setup 6 (https://jrsoftware.org/isinfo.php):
;   iscc installer\BillBullPrintAgent.iss
; Produces installer\output\BillBullPrintAgentSetup.exe
;
; Prerequisite: run `npm run build` first so dist\BillBullPrintAgent.exe exists.
; Release builds: run from a clean copy of this folder and pass /O<release dir>
; (see docs/standalone-pos/PRINT_AGENT_SECURITY.md, "Building a release") -
; building in place overwrites dist\ and installer\output\.
;
; Upgrade lifecycle (0.7.0+), the same interactive and silent:
;   1. PrepareToInstall runs the NEW exe from {tmp} with --stop: it asks the
;      running agent to exit (agents from 0.7.0 finish the requests they are
;      serving), ends older agents (BillBullPrintAgent.exe in this Windows
;      session) after a grace period, and confirms nothing still answers on
;      127.0.0.1:19777. If that fails, setup stops before any file is replaced
;      (exit code 7), showing the reason; the installed agent is left as it was.
;   2. Files are replaced; config.json and tokens.json are not touched.
;   3. The trusted site and printers entered on the wizard pages (or given as
;      /ORIGIN= /RECEIPTPRINTER= /LABELPRINTER=) are added with the CLI.
;   4. The new agent is started as the user who ran setup, also on /VERYSILENT,
;      and setup waits up to 20 s for it to answer /health with this version.
;      If it does not (another program on the port, say), setup says why and
;      exits 10 instead of 0; the agent itself keeps retrying from its tray.
; Unattended: BillBullPrintAgentSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /LOG="<file>" ...
; (without /SUPPRESSMSGBOXES an error is still shown in a message box).

#define MyAppName "BillBull Print Agent"
; Keep this in lockstep with tools/pos-print-agent/package.json "version" and the
; agent's GET /health response — the whole point of the version is that a till's
; Add/Remove-Programs entry and /health agree on which build is deployed. Bump
; both together on every agent change. (Was hardcoded 0.1.0 while the agent was
; already 0.4.0, so installed tills reported a version that matched nothing.)
#define MyAppVersion "0.7.0"
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
; The running agent is stopped by PrepareToInstall (see the header), before
; Restart Manager looks for files in use. Restart Manager stays on only as a
; backstop; it cannot restart a windowless agent, so setup starts it itself.
CloseApplications=yes
RestartApplications=no

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

[UninstallRun]
; Stop the running agent before its files are removed (the same --stop as an
; upgrade). If it cannot be stopped the uninstall continues and may leave
; BillBullPrintAgent.exe behind; quit the agent and delete the folder by hand.
; Installs before 0.7.0 also logged a "StopAgent" taskkill entry; it may run
; as well and is harmless.
Filename: "{app}\{#MyAppExeName}"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopAgentV2"

[UninstallDelete]
; Trusted sites and printer setup (config.json) and paired-browser token hashes (tokens.json).
; Removing them means a reinstall starts unpaired, which is the safe default.
Type: filesandordirs; Name: "{userappdata}\BillBull\PrintAgent"

[Code]
// 0.6.0+: the agent only prints for BillBull sites it has been told to trust
// (exact address, e.g. https://acme.billbull.app). This page asks for that
// address and hands it to `BillBullPrintAgent.exe --add-origin`, which validates
// it and writes %APPDATA%\BillBull\PrintAgent\config.json.
// Silent installs: BillBullPrintAgentSetup.exe /VERYSILENT /ORIGIN=https://acme.billbull.app
//
// 0.7.0+: the agent prints only to printers set up for it, each bound to the
// command language it speaks (receipts = ESC/POS, Zebra labels = ZPL). Nothing
// is set up automatically, and no earlier version recorded which printer is
// which, so an upgrade asks again. The second page hands each name to
// `BillBullPrintAgent.exe --set-printer "<name>" escpos|zpl`; the same choice
// is in the tray menu (Printers) after setup.
// Silent installs: /RECEIPTPRINTER="POS-80C" /LABELPRINTER="ZDesigner ZD220-203dpi ZPL"
var
  OriginPage: TInputQueryWizardPage;
  PrinterPage: TInputQueryWizardPage;
  // Why the new agent is not running after setup, or ''.
  AgentProblem: String;

// Runs a print agent command and returns its exit code; Output receives what
// it reported. The exe is windowed and prints to no console, so the result is
// read back from the file it writes with --out (UTF-8). Every call is logged.
function AgentCommand(const Exe, Params: String; var Output: String): Integer;
var
  OutFile: String;
  Lines: TArrayOfString;
  I, ResultCode: Integer;
begin
  OutFile := ExpandConstant('{tmp}\agent-result.txt');
  DeleteFile(OutFile);
  Output := '';
  if not Exec(Exe, Params + ' --out "' + OutFile + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Output := 'Could not run the print agent: ' + SysErrorMessage(ResultCode);
    Log('Agent ' + Params + ': ' + Output);
    Result := -1;
    exit;
  end;
  if LoadStringsFromFile(OutFile, Lines) then
    for I := 0 to GetArrayLength(Lines) - 1 do
      Output := Output + Lines[I] + #13#10;
  Output := Trim(Output);
  Log('Agent ' + Params + ' -> exit ' + IntToStr(ResultCode) + ': ' + Output);
  Result := ResultCode;
end;

procedure InitializeWizard;
begin
  OriginPage := CreateInputQueryPage(wpSelectTasks,
    'BillBull address',
    'Which BillBull site prints on this PC?',
    'Enter the exact address this till opens BillBull at, for example https://acme.billbull.app. ' +
    'The print agent refuses every other website. On an upgrade you may leave this empty to keep the sites already trusted.');
  OriginPage.Add('BillBull address:', False);
  OriginPage.Values[0] := ExpandConstant('{param:ORIGIN|}');

  PrinterPage := CreateInputQueryPage(OriginPage.ID,
    'Printers',
    'Which printers does BillBull print to on this PC?',
    'Type each printer''s name exactly as Windows shows it (Settings > Bluetooth & devices > Printers & scanners). ' +
    'The print agent sends receipts only to the receipt printer and labels only to the label printer, and refuses every other printer. ' +
    'Leave a field empty to keep what this PC already has, or to choose later from the print agent''s tray menu > Printers.');
  PrinterPage.Add('Receipt printer (ESC/POS):', False);
  PrinterPage.Add('Zebra label printer (ZPL):', False);
  PrinterPage.Values[0] := ExpandConstant('{param:RECEIPTPRINTER|}');
  PrinterPage.Values[1] := ExpandConstant('{param:LABELPRINTER|}');
end;

function OriginValue: String;
begin
  Result := Trim(OriginPage.Values[0]);
end;

function ReceiptPrinterValue: String;
begin
  Result := Trim(PrinterPage.Values[0]);
end;

function LabelPrinterValue: String;
begin
  Result := Trim(PrinterPage.Values[1]);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = OriginPage.ID then
  begin
    if OriginValue = '' then
      Result := MsgBox('No address entered. Keep the BillBull sites this PC already trusts (upgrade)?' + #13#10 +
        'On a new install, printing will be refused until a site is added.', mbConfirmation, MB_YESNO) = IDYES
    else if Pos('https://', Lowercase(OriginValue)) <> 1 then
    begin
      MsgBox('Enter the full address starting with https://, for example https://acme.billbull.app', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PrinterPage.ID then
  begin
    if (Pos('"', ReceiptPrinterValue) > 0) or (Pos('"', LabelPrinterValue) > 0)
        or (Pos(',', ReceiptPrinterValue) > 0) or (Pos(',', LabelPrinterValue) > 0) then
    begin
      MsgBox('A printer name cannot contain " or a comma. Choose the printer from the tray menu after setup instead.', mbError, MB_OK);
      Result := False;
    end
    else if (ReceiptPrinterValue <> '') and (CompareText(ReceiptPrinterValue, LabelPrinterValue) = 0) then
    begin
      MsgBox('One printer cannot be both the receipt printer and the label printer.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// Stop the running agent before any file is replaced (header, step 1). The
// NEW exe does it, so old agents that know nothing of --stop are handled too.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Output: String;
begin
  Result := '';
  ExtractTemporaryFile('{#MyAppExeName}');
  if AgentCommand(ExpandConstant('{tmp}\{#MyAppExeName}'), '--stop', Output) <> 0 then
    Result := 'The BillBull Print Agent that is running now could not be stopped, so setup changed nothing.' + #13#10#13#10 +
      Output + #13#10#13#10 +
      'The agent already installed keeps working as before. Stop it as described above, then run setup again.';
end;

procedure SetPrinter(const Name, Kind, KindText: String);
var
  Output: String;
begin
  if Name = '' then exit;
  if AgentCommand(ExpandConstant('{app}\{#MyAppExeName}'), '--set-printer "' + Name + '" ' + Kind, Output) <> 0 then
    SuppressibleMsgBox('The print agent did not accept "' + Name + '" as the ' + KindText + ':' + #13#10 + Output + #13#10#13#10 +
      'Choose it from the print agent''s tray menu > Printers after setup.', mbError, MB_OK, IDOK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Exe, Output: String;
begin
  if CurStep <> ssPostInstall then exit;
  Exe := ExpandConstant('{app}\{#MyAppExeName}');
  if OriginValue <> '' then
    if AgentCommand(Exe, '--add-origin "' + OriginValue + '"', Output) <> 0 then
      SuppressibleMsgBox('The print agent did not accept "' + OriginValue + '" as a BillBull address:' + #13#10 + Output + #13#10#13#10 +
        'Add it after setup with: BillBullPrintAgent.exe --add-origin <address> | more', mbError, MB_OK, IDOK);
  SetPrinter(ReceiptPrinterValue, 'escpos', 'receipt printer');
  SetPrinter(LabelPrinterValue, 'zpl', 'label printer');

  // Start the new agent as the till user (header, step 4), silent or not.
  if not ExecAsOriginalUser(Exe, '', ExpandConstant('{app}'), SW_SHOWNORMAL, ewNoWait, ResultCode) then
    AgentProblem := 'Setup could not start it: ' + SysErrorMessage(ResultCode)
  else if AgentCommand(Exe, '--status --wait 20000', Output) <> 0 then
    AgentProblem := Output;
  if AgentProblem <> '' then
  begin
    Log('Print agent not running after setup: ' + AgentProblem);
    SuppressibleMsgBox('BillBull Print Agent was installed but is not running, so BillBull cannot print on this PC yet.' + #13#10#13#10 +
      AgentProblem + #13#10#13#10 +
      'When that is fixed, choose Retry in the print agent''s tray menu, or start it from the Start menu (BillBull Print Agent). ' +
      'The log is in %APPDATA%\BillBull\PrintAgent\logs.', mbError, MB_OK, IDOK);
  end;
end;

// 0 = installed and running; 10 = installed, but the agent is not running.
function GetCustomSetupExitCode: Integer;
begin
  if AgentProblem <> '' then
    Result := 10
  else
    Result := 0;
end;
