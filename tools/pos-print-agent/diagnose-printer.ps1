<#
.SYNOPSIS
  BillBull POS printer diagnostics - run this on the till, on the exact printer
  name configured in BillBull (e.g. "POS-80C"), to get the facts needed to
  close out a RAW-print failure or right-edge-clipping report.

.USAGE
  powershell -ExecutionPolicy Bypass -File diagnose-printer.ps1 -PrinterName "POS-80C"

  Paste the full output back for review. Nothing here modifies the printer,
  its driver, or the Windows spooler - it only reads state.
#>
param(
  [Parameter(Mandatory = $true)][string]$PrinterName
)

$ErrorActionPreference = 'Continue'
Write-Host "=== BillBull Printer Diagnostics ===" -ForegroundColor Cyan
Write-Host "Target printer: $PrinterName`n"

# 1. Queue existence + live state -------------------------------------------
Write-Host "--- 1. Queue state (Get-Printer) ---" -ForegroundColor Yellow
$printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
  Write-Host "NOT FOUND as an exact match. Here are all installed printers (check for a name mismatch):" -ForegroundColor Red
  Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus | Format-Table -AutoSize
  Write-Host "`nDiagnostics cannot continue without the exact printer name. Re-run with the exact 'Name' shown above." -ForegroundColor Red
  exit 1
}
$printer | Select-Object Name, DriverName, PortName, PrinterStatus, WorkOffline, Shared, Type | Format-List

# 2. Driver details + datatype list ------------------------------------------
Write-Host "--- 2. Driver details ---" -ForegroundColor Yellow
$driver = Get-PrinterDriver -Name $printer.DriverName -ErrorAction SilentlyContinue
if ($driver) {
  $driver | Select-Object Name, DriverVersion, PrinterEnvironment, MajorVersion, Manufacturer | Format-List
  Write-Host "MajorVersion 4 = XPS/v4 class driver (known to reject RAW jobs)." -ForegroundColor Gray
  Write-Host "MajorVersion 3 = legacy GDI driver (RAW-capable, what we need)." -ForegroundColor Gray
} else {
  Write-Host "Could not read driver info for '$($printer.DriverName)'." -ForegroundColor Red
}

Write-Host "`nDatatypes this port/driver combination actually supports (from the spooler):" -ForegroundColor Yellow
try {
  Add-Type -AssemblyName System.Printing -ErrorAction SilentlyContinue
} catch {}
# EnumPrintersW-based datatype enumeration is not exposed by a simple cmdlet;
# the most reliable signal is the live StartDocPrinter probe in section 4.

# 3. Stuck / errored jobs currently in the queue -----------------------------
Write-Host "--- 3. Jobs currently in queue ---" -ForegroundColor Yellow
$jobs = Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue
if ($jobs) {
  $jobs | Select-Object Id, DocumentName, JobStatus, SubmittedTime, Size | Format-Table -AutoSize
  $stuck = $jobs | Where-Object { $_.JobStatus -match 'Error|PaperOut|Paused|Blocked' }
  if ($stuck) {
    Write-Host "FOUND $($stuck.Count) stuck/errored job(s) - this alone can make every new job fail or hang. Clear the queue (right-click printer, See whats printing, Cancel All)." -ForegroundColor Red
  }
} else {
  Write-Host "(queue is empty)" -ForegroundColor Gray
}

# 4. Live RAW-datatype probe - the definitive test ---------------------------
Write-Host "--- 4. Live RAW StartDocPrinter probe (the definitive test) ---" -ForegroundColor Yellow
Add-Type -Name RawPrinterDiag -Namespace BillBullDiag -MemberDefinition @'
  [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA pDocInfo);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
'@

function Test-Datatype([string]$Name, [string]$DataType) {
  $hPrinter = [IntPtr]::Zero
  $openOk = [BillBullDiag.RawPrinterDiag]::OpenPrinter($Name, [ref]$hPrinter, [IntPtr]::Zero)
  if (-not $openOk) {
    $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    return "OpenPrinter FAILED (Win32Error $code`: $((New-Object System.ComponentModel.Win32Exception($code)).Message))"
  }
  try {
    $docInfo = New-Object BillBullDiag.RawPrinterDiag+DOCINFOA
    $docInfo.pDocName = "BillBull Diagnostic ($DataType probe)"
    $docInfo.pDataType = $DataType
    $ok = [BillBullDiag.RawPrinterDiag]::StartDocPrinter($hPrinter, 1, [ref]$docInfo)
    $code = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($ok) {
      [BillBullDiag.RawPrinterDiag]::EndDocPrinter($hPrinter) | Out-Null
      return "SUPPORTED (StartDocPrinter succeeded - job was opened and immediately closed, nothing was actually sent to paper)"
    }
    return "REJECTED (Win32Error $code`: $((New-Object System.ComponentModel.Win32Exception($code)).Message))"
  } finally {
    [BillBullDiag.RawPrinterDiag]::ClosePrinter($hPrinter) | Out-Null
  }
}

Write-Host "RAW datatype:        $(Test-Datatype $PrinterName 'RAW')"
Write-Host "TEXT datatype:       $(Test-Datatype $PrinterName 'TEXT')"
Write-Host ""
Write-Host "If RAW is REJECTED with 'datatype is invalid' (error 1804), the driver" -ForegroundColor Cyan
Write-Host "currently installed for this queue does not support raw ESC/POS jobs." -ForegroundColor Cyan
Write-Host "Fix: reinstall the printer using its vendor's driver, or Windows' built-in" -ForegroundColor Cyan
Write-Host "'Generic / Text Only' driver, instead of whatever is installed now." -ForegroundColor Cyan

# 5. GDI page geometry (relevant to right-edge clipping on the text/GDI path) -
Write-Host "`n--- 5. GDI page geometry (text-mode print path) ---" -ForegroundColor Yellow
Add-Type -AssemblyName System.Drawing
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $PrinterName
if ($doc.PrinterSettings.IsValid) {
  $paperMm80 = [Math]::Round((80 / 25.4) * 100)
  $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Probe80mm', $paperMm80, 3000)
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  Write-Host "Configured paper width:     80.00 mm ($paperMm80 / 100 in)"
  Write-Host "Driver HardMarginX:         $($doc.DefaultPageSettings.HardMarginX) / 100 in = $([Math]::Round($doc.DefaultPageSettings.HardMarginX * 0.254, 2)) mm"
  Write-Host "Driver HardMarginY:         $($doc.DefaultPageSettings.HardMarginY) / 100 in"
  $printableWidthHundredths = $paperMm80 - (2 * $doc.DefaultPageSettings.HardMarginX)
  Write-Host "Effective printable width:  $printableWidthHundredths / 100 in = $([Math]::Round($printableWidthHundredths * 0.254, 2)) mm"
  if ($doc.DefaultPageSettings.HardMarginX -gt 0) {
    Write-Host "NON-ZERO hard margin confirmed - this is what was clipping the right edge of text-mode receipts before the font auto-shrink fix (agent 0.2.x+)." -ForegroundColor Red
  } else {
    Write-Host "Hard margin is zero for this driver - right-edge clipping (if seen) is NOT caused by hard margins on this printer; re-check the physical roll width vs. the 'Paper Size' set in BillBull Settings -> Devices." -ForegroundColor Yellow
  }
  Write-Host "Printer resolutions reported by driver:"
  $doc.PrinterSettings.PrinterResolutions | ForEach-Object { Write-Host "  $($_.X) x $($_.Y) dpi ($($_.Kind))" }
} else {
  Write-Host "Printer settings invalid for GDI probe." -ForegroundColor Red
}

Write-Host "`n=== Diagnostics complete - copy everything above ===" -ForegroundColor Cyan
