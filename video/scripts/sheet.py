"""Contact sheet: python3 scripts/sheet.py out.jpg cols f1 f2 ..."""
import sys
from PIL import Image, ImageDraw
out, cols, frames = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f"out/stills/f{int(f):03d}.jpg") for f in frames]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 8), rows * (h + 8)), (255, 255, 255))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, frames)):
    x, y = (i % cols) * (w + 8), (i // cols) * (h + 8)
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + 60, y + 22], fill=(0, 0, 0))
    d.text((x + 5, y + 5), f"f{f}", fill=(255, 255, 255))
scale = min(1.0, 2400 / sheet.width)
sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.LANCZOS)
sheet.save(out, quality=86)
print(sheet.size)
