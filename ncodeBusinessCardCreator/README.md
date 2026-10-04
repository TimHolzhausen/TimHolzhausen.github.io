# nCode Business Card Creator

A browser app that turns any image into a sheet of business cards with an
Ncode dot pattern on the back, ready for a Neo smartpen.

**Live:** https://timholzhausen.github.io/ncodeBusinessCardCreator/

## What it does

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
