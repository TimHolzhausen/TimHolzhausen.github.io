# nCode Business Card Creator

A browser app that turns any image into a sheet of business cards with an
Ncode dot pattern on the back, ready for a Neo smartpen.

**Live:** https://timholzhausen.github.io/ncodeBusinessCardCreator/

## What it does

The page leads through three steps: **1 Front**, **2 Back**, **3 Print**. Each step shows only its own
settings; the preview on the right follows the step (front, back or A4 sheet) and can be switched anytime.
One dot strength (chosen in step 2) is used for the A4 sheet and for the single backs.


1. Upload a front image (JPG, PNG or WebP). Choose whether it was designed
   with bleed (91 × 60 mm) or at trim size (85 × 54 mm; the edges are then
   mirrored into the bleed). Zoom, rotate and drag to position it.
2. Pick the Ncode strength for the back:
   - **Normal**: original dot size, most robust
   - **Light**: half the dot area, tested and working
   - **Extra light**: a third of the dot area, experimental
3. Pick a sheet layout and the bleed (0–3 mm):
   - **9 cards**, 3 × 3 upright, bleed all around (two cuts between cards)
   - **8 cards**, 2 × 4 landscape, bleed all around (two cuts between cards)
   - **10 cards**, 2 × 5 landscape, edge to edge (one cut between cards,
     bleed on the outer edges only)
4. Download the PDF: A4, page 1 = fronts, page 2 = Ncode backs, crop marks
   on the outside of the sheet.

5. Or, for online print shops such as Vistaprint: download single back
   files (one card per file, or all ten as a ZIP) and upload them as the
   back design. Formats: 85 × 55 mm with 1.5 mm bleed (88 × 58 mm,
   Vistaprint), 2 mm or 3 mm bleed, or 85 × 54 mm with 3 mm bleed. PDF
   (image mask filled with 100 % K, TrimBox set) or PNG (1-bit, 600 dpi).
   Order a small test run first: the pen only reads pure carbon black, and
   any downsampling or RGB/rich-black conversion by the shop breaks the code.

6. Optional back design: add text, lines and images on top of the code. A layer
   list shows all elements; the settings panel only shows the selected one.
   Drag elements in the back preview (the centre snaps to the card centre),
   drag the ends of a line to turn or lengthen it (snaps to 45° steps),
   arrow keys nudge, Delete removes. Images can fill the whole card as a
   background.
7. Background for the back: six magic-themed presets in `hintergruende/`
   (sepia guilloche, card emblem, top hat, card-back lattice, starry sky,
   marbled endpaper; each exactly the code-bitmap size, 2150 × 1417 px at
   600 dpi, plus a small `-klein.jpg` thumbnail) or an uploaded image. It sits
   behind everything, covers the bleed, has its own opacity, and like the
   rest of the design is printed with K = 0. Light, fine-textured tones hide
   the grey haze of the dots. A chosen preset is remembered; an uploaded
   image is not. The design is written into the PDFs
   (A4 sheet and single backs) as a CMYK image with **K = 0** (C = 1 − R,
   M = 1 − G, Y = 1 − B, plus a soft mask) underneath the 100 % K dots. The
   pen only sees carbon black, so it reads the code through the design.
   PNG backs stay without design (1-bit). Not tested at print shops yet: it
   only works if the shop prints the colours as delivered and does not add K.
   Text items are remembered in the browser, images are not.
8. Header band for the back: five styles drawn in the browser (sparks,
   starry night, art deco, stage curtain, parchment). A decorative band runs
   from the top bleed to 6 mm into the card, then a light strip with an
   editable tagline (Georgia caps, letter-spaced, “•” in the accent colour,
   shrinks to fit the safe area) and a gold rule. The default text and ten
   suggestions for magicians follow the browser language (German or
   English). Uppercase can be switched off, and the light strip can be made
   transparent so the text sits on the background. The random sparks and stars use
   a fixed seed, so the preview and the PDF match. The band is drawn above
   the background and below text, lines and images, is printed with K = 0
   like the rest of the design, and is remembered in the browser.
   "Match the background" picks a band made for the chosen preset background
   (guilloche rosette, card emblem, top hats, card-back lattice, moon phases,
   marbled veins) and follows when the background changes. Shape: top only,
   top + bottom (the band repeated at the bottom, turned by 180°, no text) or
   frame (plus side bars reaching 2.6 mm into the card). Card suits are drawn
   as paths, so phones cannot turn them into emoji.
9. Line styles for own lines: solid, dashed, dotted, double, rule with
   diamond, star in the middle, card suits in the middle, scroll ends, wave,
   and "match the header band" (motif and accent colour follow the chosen
   band). "Header colour" copies the band's accent colour to any line or
   text. Older saved lines with the dashed flag stay dashed.

Everything runs locally in the browser. Images are never uploaded anywhere.

## Printing

- Print at **100 % / actual size**. Never "fit to page", no borderless printing.
- Double-sided on the long or short edge both work, the layout is symmetric.
  Without duplex, print page 1, turn the paper over, then print page 2.
- Use a laser printer and print black as **K** (carbon black). The pen reads
  with infrared light and does not see black mixed from C, M and Y. A
  PostScript driver passes the dots through most cleanly.

## Cutting

The crop marks sit outside the cards only.

1. Front side up, cut all horizontal lines at the side marks, working from
   the bottom up. The marks stay on the remaining piece until the last strip
   is off.
2. Stack the strips with the top strip (marks along its top edge) on top,
   put the left paper edge against the guide and cut vertically at the marks.

Every sheet carries the same codes, so printing several sheets gives
duplicate cards.

## Technical notes

- The PDF is written by hand in `index.html`, no libraries. The Ncode is
  embedded as 1-bit image masks at exactly 600 dpi and filled with pure
  black (DeviceGray 0), so it prints as K only. The front is a 600 dpi JPEG.
- `ncode_data.js` holds the ten card codes in three strengths as
  zlib-compressed bitmaps (91 × 60 mm each, 3 mm bleed around the card).
  They go into the PDF as FlateDecode streams unchanged.
- No build step: open `index.html` directly or serve the folder.
