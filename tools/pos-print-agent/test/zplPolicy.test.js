"use strict";

// Unit coverage for the ZPL allowlist. Real labels from the BillBull builders
// are checked in fixtures.test.js; this pins the grammar and the refusals.

const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectZpl, describeZplRefusal } = require("../lib/zplPolicy");
const { inspectEscPos } = require("../lib/escposPolicy");

const verdict = (s) => inspectZpl(Buffer.from(s, "utf8"));
const LABEL = [
  "^XA", "^CI28", "^PW400", "^LL200", "^LH0,0", "^LS0", "^PON", "^MMT",
  "^FO0,48^FB400,1,0,C,0^A0N,21,21^FH^FDACME_5ETrading^FS",
  "^BY2,2,50", "^FO40,86^BCN,50,Y,N,N^FH^FDBB-TEST-01^FS",
  "^XZ",
].join("\n");
const inLabel = (cmd) => LABEL.replace("^XZ", `${cmd}\n^XZ`);
const refusedAs = (s, category) => {
  const v = verdict(s);
  assert.equal(v.allowed, false, s);
  assert.equal(v.category, category, `${s}: ${JSON.stringify(v)}`);
  return v;
};

test("a BillBull label, several labels, CRLF and UTF-8 text are allowed", () => {
  assert.deepEqual(verdict(LABEL), { allowed: true });
  assert.deepEqual(verdict(`${LABEL}\n${LABEL}\r\n${LABEL}\r\n`), { allowed: true });
  assert.deepEqual(verdict(LABEL.replace("ACME_5ETrading", "عطر فاخر")), { allowed: true });
  assert.deepEqual(verdict("^XA^FO1,1^ADN,36,20^FDx^FS^XZ"), { allowed: true }); // resident font D
});

test("every allowed ZPL job is also inert on an ESC/POS printer", () => {
  // No ESC/GS/DLE/BEL bytes: a label sent to a receipt printer by mistake cannot drive it.
  assert.equal(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(LABEL), false);
  // To the ESC/POS walker it is plain text. Keeping it off a receipt printer
  // (and receipts off a Zebra) is the destination's job: see protocolBinding.test.js.
  assert.deepEqual(inspectEscPos(Buffer.from(LABEL)), { allowed: true });
});

test("tilde commands are refused anywhere, including inside field data", () => {
  refusedAs("~JR", "POWER");
  refusedAs(`${LABEL}~JR`, "POWER");
  refusedAs(LABEL.replace("ACME_5ETrading", "ACME~JR"), "POWER");
  refusedAs("~DYE:FW.ZPL,B,T,10,,0123456789", "STORAGE");
  refusedAs("~NC123", "NETWORK");
  refusedAs("~WC", "DEVICE_CONTROL");
  refusedAs("~HS", "DEVICE_QUERY");
  refusedAs("~CC+", "CONFIG_WRITE");
});

test("configuration, network, storage and unused commands are refused", () => {
  refusedAs(inLabel("^JUF"), "CONFIG_WRITE");     // factory defaults
  refusedAs(inLabel("^JUS"), "CONFIG_WRITE");     // save settings to flash
  refusedAs(inLabel("^MD30"), "CONFIG_WRITE");    // darkness
  refusedAs(inLabel("^NC1"), "NETWORK");
  refusedAs(inLabel("^NS,192.168.1.9"), "NETWORK");
  refusedAs(inLabel("^IDE:*.*"), "STORAGE");      // delete every file
  refusedAs(inLabel("^DFR:X.ZPL"), "STORAGE");
  refusedAs(inLabel("^XGR:LOGO.GRF,1,1"), "STORAGE");
  refusedAs(inLabel("^HH"), "DEVICE_QUERY");
  refusedAs(inLabel("^PQ1000"), "UNSUPPORTED");
  refusedAs(inLabel("^FXcomment"), "UNSUPPORTED");
  refusedAs(inLabel("^QQ"), "UNKNOWN");
  refusedAs("^JUF", "CONFIG_WRITE");              // outside a format, too
  refusedAs("^FO1,1", "OUTSIDE_FORMAT");
});

test("printer settings are limited to the values BillBull uses", () => {
  refusedAs(inLabel("^CI0"), "MALFORMED");
  refusedAs(inLabel("^MMC"), "MALFORMED");        // cutter mode
  refusedAs(inLabel("^PW400,1"), "MALFORMED");
  refusedAs(inLabel("^FH\\"), "MALFORMED");       // another hex indicator
  refusedAs(inLabel("^FO1,1^A@N,20,20,E:FONT.TTF^FDx^FS"), "UNKNOWN"); // font loaded by file name
  refusedAs(inLabel("^ju"), "CONFIG_WRITE");      // lower case is refused and still named
});

test("malformed and incomplete structure is refused", () => {
  refusedAs("", "INCOMPLETE");
  refusedAs("   \r\n", "INCOMPLETE");
  refusedAs("^XA^FO1,1^FDx^FS", "INCOMPLETE");    // no ^XZ
  refusedAs("^XA^FO1,1^FDx", "INCOMPLETE");       // field data never closed
  refusedAs(LABEL.slice(0, -1), "INCOMPLETE");    // ends "^X"
  refusedAs("^XA^XA^XZ", "MALFORMED");            // nested format
  refusedAs("^XA^FDx^FS^XZ", "MALFORMED");        // data without an origin
  refusedAs("^XA^FO1,1^FO2,2^FDx^FS^XZ", "MALFORMED");
  refusedAs("^XA^FO1,1^FDx^FDy^FS^XZ", "MALFORMED");
  refusedAs("^XA^FO1,1^XZ", "MALFORMED");         // field left open
  refusedAs("^XA^FO1,1^FS^XZ", "MALFORMED");      // field without data
  refusedAs("^XA^PW400^FO1,1^FDx^FS^XZjunk", "MALFORMED");
  refusedAs("\x1b@^XA^XZ", "CONTROL_CHARACTER");  // ESC/POS init in front
  refusedAs("^XA^FO1,1^FDa\x07b^FS^XZ", "CONTROL_CHARACTER");
  refusedAs("^XA^FO1,1^FH^FDa_4^FS^XZ", "MALFORMED");   // truncated hex escape
  refusedAs("^XA^FO1,1^FH^FDa_ZZ^FS^XZ", "MALFORMED");
  refusedAs(`^XA^FO1,1^FD${"x".repeat(4000)}^FS^XZ`, "MALFORMED");
});

test("field data cannot break out of its field", () => {
  // The old builder wrote "\^" for '^'; ZPL reads that as '\' then the next command.
  refusedAs("^XA^FO1,1^FDShirt\\^JUF^FS^XZ", "CONFIG_WRITE");
  refusedAs("^XA^FO1,1^FDShirt\\~JR^FS^XZ", "POWER");
  // A second label hidden after a field is just another (checked) label.
  assert.equal(verdict("^XA^FO1,1^FDa^FS^XZ^XA^FO1,1^FDb^FS^XZ").allowed, true);
});

test("the refusal names the command and its position", () => {
  const v = refusedAs(inLabel("^JUF"), "CONFIG_WRITE");
  assert.equal(v.command, "^JU");
  assert.match(describeZplRefusal(v), /\^JU at byte \d+ changes the printer's settings\. Nothing was sent/);
});
