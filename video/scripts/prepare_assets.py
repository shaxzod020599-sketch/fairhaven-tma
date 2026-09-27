"""Prepare static assets for the Remotion reel.

- label-clean.jpg : FH PRO Women label (from web/) with the printed ovum icon and the
                    tiny side legal text removed from the berry band, so the 3D decal
                    can draw a resolution-independent ovum at the same spot.
- bottles/*.png   : product cut-outs copied from web/public/assets/p3d.
- grain.png       : tileable film-grain texture.
- src/wordmark.json : Fairhaven Health wordmark paths, ordered left→right.
"""
import json
import re
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, binary_dilation

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT.parent / "web" / "public"
PUBLIC = ROOT / "public"
(PUBLIC / "bottles").mkdir(parents=True, exist_ok=True)


def clean_label():
    src = np.asarray(Image.open(WEB / "assets" / "fh-pro-women-label.jpg").convert("RGB")).astype(np.float64)
    h, w, _ = src.shape
    yy, xx = np.mgrid[0:h, 0:w]

    # Region to repaint: icon + sperm tail + the narrow legal-text column on the right.
    fill = ((xx >= 690) & (yy >= 566) & (yy <= 906)) | ((xx >= 520) & (yy >= 676) & (yy <= 906))
    fill |= (xx >= 558) & (yy >= 642) & (yy <= 906)  # top of the printed rim glow
    fill &= ~((xx >= 752) & (yy < 600))  # keep the white supplement-facts panel
    icon = (xx - 665) ** 2 + (yy - 767) ** 2 < 175 ** 2

    blur = np.stack([gaussian_filter(src[..., c], 1.5) for c in range(3)], -1)
    lum = blur.mean(-1)
    berry = (blur[..., 0] > blur[..., 1] + 30) & (lum < 125)
    # Stay clear of white type and the pink glow so their fringes do not tint the fill.
    bright = lum > 118
    valid = berry & ~binary_dilation(bright, iterations=6) & ~fill & (yy > 560)

    # The sperm tail's tip runs up beside the facts panel; include it.
    fill |= (xx >= 736) & (xx < 752) & (yy >= 530) & (yy < 600) & ~bright

    # Seamless repaint: solve Laplace's equation inside the region with the surrounding
    # band as boundary (bright type/glow pixels on the boundary replaced by a local
    # berry estimate), then re-grain.
    wsum = gaussian_filter(valid.astype(np.float64), 30)
    berry_est = np.stack([gaussian_filter(src[..., c] * valid, 30) for c in range(3)], -1) / np.maximum(wsum, 1e-9)[..., None]
    boundary_src = np.where(bright[..., None], berry_est, src)

    from scipy.sparse import lil_matrix
    from scipy.sparse.linalg import spsolve

    ys, xs = np.nonzero(fill)
    index = -np.ones((h, w), dtype=np.int64)
    index[ys, xs] = np.arange(len(ys))
    n = len(ys)
    A = lil_matrix((n, n))
    rhs = np.zeros((n, 3))
    for k, (y, x) in enumerate(zip(ys, xs)):
        diag = 0
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            qy, qx = y + dy, x + dx
            if not (0 <= qy < h and 0 <= qx < w):
                continue  # image edge: Neumann
            diag += 1
            j = index[qy, qx]
            if j >= 0:
                A[k, j] = -1
            else:
                rhs[k] += boundary_src[qy, qx]
        A[k, k] = diag
    A = A.tocsr()
    out = src.copy()
    for c in range(3):
        out[ys, xs, c] = spsolve(A, rhs[:, c])

    # Re-grain the repaint so it matches the photographic texture around it.
    rng = np.random.default_rng(7)
    grain = gaussian_filter(rng.normal(0, 1, (h, w)), 0.7) * 11 + gaussian_filter(rng.normal(0, 1, (h, w)), 3) * 9
    for c in range(3):
        out[..., c] = np.where(fill, out[..., c] + grain, out[..., c])

    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    img = img.resize((w * 2, h * 2), Image.LANCZOS)
    img.save(PUBLIC / "label-clean.jpg", quality=95)
    print("label-clean.jpg", img.size)


def copy_bottles():
    for name in ["fhpro-women", "fhpro-men", "fertilaid-women", "fertilaid-men", "lactation", "prenatal"]:
        shutil.copy(WEB / "assets" / "p3d" / f"{name}.png", PUBLIC / "bottles" / f"{name}.png")
    print("bottles copied")


def grain_texture():
    rng = np.random.default_rng(3)
    n = 512
    noise = rng.normal(0, 1, (n, n))
    # tileable soft grain: blur with wrap so edges match
    noise = gaussian_filter(noise, 0.7, mode="wrap")
    noise = noise / noise.std()
    img = np.clip(128 + noise * 38, 0, 255).astype(np.uint8)
    Image.fromarray(img, "L").save(PUBLIC / "grain.png")
    print("grain.png")


def wordmark():
    svg = (WEB / "fh-wordmark.svg").read_text()
    paths = re.findall(r'<path[^>]*d="([^"]+)"', svg)

    def min_x(d):
        nums = [float(v) for v in re.findall(r"-?\d*\.?\d+", d)]
        return nums[0]

    # Known glyph order (by x position): F a i r h a v e n H e a l t h ®
    order = [2, 3, 8, 4, 1, 5, 9, 6, 7, 12, 14, 15, 10, 13, 11, 16, 17]
    glyphs = [{"d": paths[i], "id": i} for i in order]
    data = {"viewBox": [0, 0, 412, 71], "glyphs": glyphs, "dot": {"d": paths[0], "cx": 73.2, "cy": 21.35, "r": 3.95}}
    (ROOT / "src" / "wordmark.json").write_text(json.dumps(data))
    print("wordmark.json", len(glyphs), "glyphs")


if __name__ == "__main__":
    clean_label()
    copy_bottles()
    grain_texture()
    wordmark()
