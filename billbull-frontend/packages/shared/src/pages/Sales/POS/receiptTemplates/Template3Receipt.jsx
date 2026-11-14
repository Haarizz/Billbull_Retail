import React from "react";
import { buildTemplate3Blocks } from "./template3Layout";
import { code128Svg } from "../../../../utils/bilingualReceiptCanvas";
import { SHARE_TECH_MONO_FONT_FACE, SHARE_TECH_MONO_FAMILY } from "../../../../utils/shareTechMonoFont";

/**
 * Template 3 — "BillBull Retail OS" 80mm receipt, HTML twin.
 *
 * Draws the block list from template3Layout.js; the thermal canvas
 * (buildTemplate3EscPos.js) draws the same list. Add a section in the layout,
 * never here, or preview and print will disagree.
 *
 * Styling follows the Figma Make design (dashed rules, Share Tech Mono,
 * space-between rows). The font is embedded (utils/shareTechMonoFont.js) and
 * the canvas prints with the same face, so preview and paper wrap alike.
 */
export const TEMPLATE3_CSS = `
${SHARE_TECH_MONO_FONT_FACE}
.bbt3{box-sizing:border-box;width:var(--paper-width,80mm);margin:0 auto;padding:5mm 3mm;background:#fff;color:#000;
  font-family:${SHARE_TECH_MONO_FAMILY};font-size:12px;line-height:1.35;font-weight:400}
.bbt3 *{box-sizing:border-box;font-weight:400}
.bbt3 .c{text-align:center;overflow-wrap:anywhere}
.bbt3 .logo{text-align:center;margin-bottom:3px}
.bbt3 .logo img{max-width:60%;max-height:24mm;object-fit:contain}
.bbt3 .brand{text-align:center;font-size:15px;font-weight:400;letter-spacing:.5px;overflow-wrap:anywhere}
.bbt3 .rule{margin:6px 0;border-top:1px dashed #000}
.bbt3 .row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.bbt3 .row>.l{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
.bbt3 .row>.r{flex:0 0 auto;max-width:70%;text-align:right;overflow-wrap:anywhere}
.bbt3 .wrow{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px}
.bbt3 .wrow>span:first-child{white-space:nowrap}
.bbt3 .wrow>.r{text-align:right;overflow-wrap:anywhere;min-width:0}
.bbt3 .b{font-weight:400}
.bbt3 .sm{font-size:10.5px}
.bbt3 .ar{direction:rtl;font-family:'Noto Kufi Arabic','Segoe UI',Tahoma,sans-serif;font-size:11px}
.bbt3 .arl{text-align:right}
.bbt3 .t{overflow-wrap:anywhere;white-space:pre-wrap}
.bbt3 .sec{text-align:center;font-weight:400;letter-spacing:.4px;margin-bottom:2px}
.bbt3 .gap{height:4px}
.bbt3 .tax{display:grid;grid-template-columns:.7fr .6fr 1fr 1fr .9fr;column-gap:4px;text-align:right}
.bbt3 .tax>span:nth-child(5n+1){text-align:left}
.bbt3 .qr{text-align:center;margin:4px 0}
.bbt3 .qr img{width:28mm;height:28mm;object-fit:contain}
.bbt3 .qr .ph{display:inline-flex;align-items:center;justify-content:center;width:26mm;height:26mm;border:1px dashed #000;font-size:10px}
.bbt3 .bc{margin:8px 0 2px}
.bbt3 .bc svg{width:100%!important}
`;

// Arabic only — Share Tech Mono is embedded via TEMPLATE3_CSS. Offline, Arabic
// falls back to the OS Arabic font (Segoe UI / Tahoma).
export const TEMPLATE3_FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;500;700&display=swap";

const Row = ({ blk }) => (
  <div className={`row${blk.bold ? " b" : ""}${blk.sm ? " sm" : ""}`}>
    <span className="l">{blk.l}</span>
    {blk.r ? <span className={`r${blk.rAr ? " ar" : ""}`}>{blk.r}</span> : null}
  </div>
);

function renderBlock(blk, i) {
  switch (blk.t) {
    case "logo":
      return <div key={i} className="logo"><img src={blk.src} alt="" /></div>;
    case "brand":
      return <div key={i} className="brand">{blk.text}</div>;
    case "center":
      return <div key={i} className={`c${blk.ar ? " ar" : ""}${blk.bold ? " b" : ""}${blk.sm ? " sm" : ""}`}>{blk.text}</div>;
    case "text":
      return <div key={i} className={`t${blk.sm ? " sm" : ""}`}>{blk.text}</div>;
    case "ar":
      return <div key={i} className="ar arl">{blk.text}</div>;
    case "row":
      return <Row key={i} blk={blk} />;
    case "wrow":
      return <div key={i} className="wrow"><span>{blk.l}</span><span className="r">{blk.r}</span></div>;
    case "title":
      return <div key={i} className="sec">{blk.text}</div>;
    case "rule":
      return <div key={i} className="rule" aria-hidden="true" />;
    case "gap":
      return <div key={i} className="gap" aria-hidden="true" />;
    case "taxGrid":
      return (
        <div key={i} className="tax">
          {blk.head.map((h, j) => <span key={`h${j}`}>{h}</span>)}
          {blk.rows.flatMap((r, ri) => r.map((cell, j) => <span key={`${ri}-${j}`}>{cell}</span>))}
        </div>
      );
    case "qr":
      return (
        <div key={i} className="qr">
          {blk.stampDataUrl
            ? <img src={blk.stampDataUrl} alt="" />
            : blk.dataUrl
              ? <img src={blk.dataUrl} alt="QR" />
              : <span className="ph">QR</span>}
        </div>
      );
    case "barcode":
      return (
        <div key={i}>
          <div className="bc" dangerouslySetInnerHTML={{ __html: code128Svg(blk.value, { height: 40 }) }} />
          <div className="c sm">{blk.value}</div>
        </div>
      );
    default:
      return null;
  }
}

/** Bare receipt — shared by the Live Preview and the print HTML. */
export const Template3ReceiptBody = ({ data }) => (
  <article className="bbt3" aria-label="BillBull receipt">
    {buildTemplate3Blocks(data).map(renderBlock)}
  </article>
);

/** Designer Live Preview: paper-width receipt on a soft shadow. */
const Template3Receipt = ({ data, paperSize = "80mm" }) => {
  const width = String(paperSize).includes("58") ? "58mm" : "80mm";
  return (
    <div style={{ "--paper-width": width, boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>
      <style>{TEMPLATE3_CSS}</style>
      <Template3ReceiptBody data={data} />
    </div>
  );
};

export default Template3Receipt;
