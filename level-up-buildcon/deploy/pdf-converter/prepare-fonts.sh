#!/usr/bin/env bash
# Copies the open-licensed fonts LibreOffice uses for the Agreement for Sale into ./fonts,
# so the PDF service renders it exactly as LibreOffice does on this Mac.
set -euo pipefail
cd "$(dirname "$0")"
SOURCE="${LIBREOFFICE_FONTS:-/Applications/LibreOffice.app/Contents/Resources/fonts/truetype}"
if [ ! -d "$SOURCE" ]; then
  echo "LibreOffice fonts not found at $SOURCE. Set LIBREOFFICE_FONTS to the folder." >&2
  exit 1
fi
rm -rf fonts
mkdir -p fonts
for pattern in 'Carlito-*' 'Caladea-*' 'LiberationSans-*' 'LiberationSerif-*' 'LinLibertine_R_G.ttf' 'LinLibertine_RB_G.ttf' 'LinLibertine_RI_G.ttf' 'LinLibertine_RBI_G.ttf' 'FrankRuhlHofshi-*'; do
  cp "$SOURCE"/$pattern fonts/
done
ls fonts | wc -l | xargs echo "Fonts copied:"
