# POS-80C ESC/POS Capability Probe & Root-Cause Report

**Date:** 2026-07-04
**Printer:** POS-80C (EZ-P003 class 80mm thermal), USB, driver POS-80C
**Agent:** billbull-pos-print-agent 0.5.0
**Branch:** feature/bbpos
**Status:** Pipeline verified byte-perfect in the lab. **Awaiting on-till probe results** to finalize the opcode decision (§5–§6).

---

## 1. Symptoms reported

On the client's POS-80C, the real ESC/POS sales receipt prints:

1. A large block of garbage/binary characters **before** the receipt body.
2. No logo.
3. No QR code (though the "Scan to verify" caption prints).
4. No social/stamp image.
5. Arabic text as `?????`.
6. The lower section partially cropped/truncated.

The **POS PRINTER TEST slip** (company name, branch/terminal info, normal/bold/big
text) prints **perfectly**.

---

## 2. Pipeline trace — verified byte-perfect (lab)

Every stage from receipt generation to the print head was traced and the byte
stream is identical throughout. **The software pipeline does not corrupt anything.**

| Stage | Location | Result |
|---|---|---|
| ESC/POS generation | `escPosReceipt.js` | Raster `GS v 0` header + QR `GS ( k` length framing spec-verified correct |
| Uint8Array → Base64 | `escPosReceipt.js` `uint8ArrayToBase64` | Chunked `btoa` over `subarray`; binary-safe, no UTF-8 conversion |
| Base64 → HTTP | `localPrintAgent.js` | Base64 string in JSON body, untouched |
| Base64 → bytes | `server.js` `printEscPosToPrinterQueue` | `Buffer.from(b64,'base64')` → `fs.writeFile` (binary) |
| bytes → spooler | `server.js` (winspool P/Invoke) | `WritePrinter` RAW; asserts `$written === $bytes.Length` |

**Integrity instrumentation added (RCA checklist §8):**
- Browser logs `generatedBytes` + `generatedSha256` per job (`localPrintAgent.js` `logEscPosIntegrity`).
- Agent logs `bytes` + `sha256` of the decoded buffer, and returns them in the response.
- Browser compares the two and logs `MATCH` / `MISMATCH` (`STREAM CORRUPTION` on mismatch).
- `/probe/echo` returns byteCount + SHA-256 with no printing, for a standalone check.
- **Lab result:** browser hash == agent hash == written bytes. **No corruption in transit.**

**Conclusion so far:** the garbage is the printer echoing binary command payloads
as text — i.e. the firmware is not decoding those opcodes — not a transport bug.
This must still be **confirmed on the physical printer** before any fix (§4).

---

## 3. Why it surfaced now (not a regression)

Agent 0.4.0 fixed a `CharSet.Auto` marshalling bug that had made `StartDocPrinter`
fail on strict thermal drivers, silently forcing a **plain-text GDI fallback**.
That fallback masked the issue — plain text carries no binary opcodes, so it
always printed clean. 0.4.0 made genuine RAW ESC/POS reach the POS-80C for the
first time, exposing the firmware's binary-opcode handling. 0.4.0 was correct.
See `project_pos_raw_charset_abi_bug` and §2.5 of the 2026-07-04 pipeline audit.

---

## 4. Capability probe — how to run it on the till

The probe sends **one isolated slip per graphics opcode**, each structured as:

```
ESC @  →  "TEXT BEFORE"  →  <single opcode under test>  →  "TEXT AFTER"  →  feed + cut
```

`TEXT AFTER` is the key discriminator: if it prints, the opcode failure is
contained; if it's missing/garbled, that opcode **corrupts the remaining stream**
(the cropped-tail symptom).

Steps (on the POS-80C's own workstation):
1. Ensure agent 0.5.0+ is running (`GET http://127.0.0.1:19777/health`).
2. Open `tools/pos-print-agent/probe.html` in that machine's browser.
3. Click **1. Check agent**, **2. Integrity test (no print)**, **3. Print capability slips**.
4. Read the 5 slips and record results in §5.

The 4 probe opcodes' length framings are unit-verified (store-body byte counts
match their pL/pH fields), so a garbage result is the **printer**, never the probe.

---

## 5. Probe results — TO BE FILLED FROM THE TILL

| Slip | Opcode | Image/QR renders? | TEXT AFTER survives? | Verdict |
|---|---|---|---|---|
| A | (text baseline) | n/a | — | expect clean |
| B | `GS v 0` | ☐ box / ☐ garbage / ☐ ignored | ☐ yes / ☐ no | |
| C | `GS ( L` | ☐ box / ☐ garbage / ☐ ignored | ☐ yes / ☐ no | |
| D | `ESC *` | ☐ box / ☐ garbage / ☐ ignored | ☐ yes / ☐ no | |
| E | `GS ( k` QR | ☐ QR / ☐ garbage / ☐ ignored | ☐ yes / ☐ no | |

Integrity test result: generatedSha256 = ____ , agentSha256 = ____ , **MATCH / MISMATCH**.
Printer model/firmware (if shown on a self-test print): ____.

---

## 6. Decision matrix (apply once §5 is filled)

- **Some raster opcode (B/C/D) prints a clean box** → switch
  `ditherImageToRasterCommand` to emit **only that opcode**; remove the
  unsupported one(s). No fallback layer.
- **`GS ( k` QR (E) prints a scannable QR** → keep native QR. Else → render the QR
  as a monochrome bitmap via the supported raster opcode.
- **Arabic** → cannot come through a single-byte code page. If Arabic is required
  on receipts, render it (and any mixed line) as a bitmap via the supported opcode.
  (Currently `toPrinterBytes` maps it to `?` by design.)
- **No raster opcode works at all** → compose logo + QR + Arabic + stamp into one
  monochrome bitmap and print via the sole supported method; if none exists,
  document as a firmware limitation (receipt stays text-only on this model).
- **Stamp** is presently **not implemented** on the ESC/POS path (`buildEscPosReceipt`
  has no `stampDataUrl` param) — it will need adding regardless, as a raster.

---

## 7. Changes in this pass (evidence only — no production fix yet)

- `server.js` (agent 0.5.0): `/probe/echo`, `/probe/capabilities`, per-job
  byte-length + SHA-256 logging on the RAW queue path, hash returned in response.
- `probe.html`: on-till runner for the integrity test + capability slips.
- `localPrintAgent.js`: per-print generated-vs-received SHA-256 integrity log.
- `README.md`: endpoint docs + 0.5.0 changelog.

No change to the receipt generator's opcode selection — that waits on §5.
