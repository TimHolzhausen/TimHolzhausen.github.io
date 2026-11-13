# nCode Notepad Creator

A browser app for printing your own notepad paper with an Ncode dot pattern,
ready for a Neo smartpen.

**Live:** https://timholzhausen.github.io/ncodeNotepadCreator/

## What it does

1. **Format:** DIN A4–A7, DIN lang, square pads, US Letter, index cards, or
   a custom size (20–420 mm), portrait or landscape.
2. **Design:** 14 built-in designs (simple, business, fun, planner) with
   heading, footer, accent colour and a writing guide (lines, grid, dots,
   checklist). Or upload your own scan or image:
   - the paper edge is detected automatically, the four corners can be
     dragged, and the sheet is straightened (perspective correction),
   - paper tone and uneven lighting are removed ("Remove paper tone"),
   - stretch, fill or fit to the format.
3. **Ncode:** normal, light or extra light. Ncode on the front (on top of
   the design) and, optionally, on the back. Small formats can share one
   code page, which gives more different sheets before codes repeat.
4. **Print:** imposed on A4, A3 or US Letter with bleed and crop marks
   (like the business card creator), one per page if the format equals the
   print sheet, or "final size" with TrimBox/BleedBox for a print shop.

Everything runs locally in the browser. Images are never uploaded anywhere.

## How the code is assigned

There are 10 Ncode pages of 216 × 280 mm (the same codes as the A4 sheets).
Every side of every sheet gets a region of one of these pages: by default
a page of its own (top left corner, with bleed), with "share" turned on as
many regions as fit side by side. Formats larger than 216 × 280 mm are only
partly covered; formats wider than 216 mm use the code page turned by 90°.

## Technical notes

- `ncode/{normal,light,extralight}-{0..9}.bin`: the code pages as 1-bit
  bitmaps (5103 × 6615 px, 600 dpi, rows padded to bytes, 1 = dot),
  zlib-compressed. They are loaded on demand and go into the PDF unchanged
  as `/ImageMask` with `/FlateDecode`, filled with DeviceGray 0 (K only).
  They were extracted from the PDFs in `../ncodeSheets/files/`.
- The design is rendered at 300 dpi and stored as **DeviceCMYK with K = 0**,
  so no part of the design prints with black toner and covers the dots.
- The PDF is written by hand, no libraries. Each code page and the design
  are embedded once and referenced from every sheet.
- The page needs to be served over HTTP (it fetches the code files);
  opening `index.html` as a local file does not work.
