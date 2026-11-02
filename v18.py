import numpy as np
from PIL import Image, ImageFilter

OUT = r'E:\Deepseek Harness\插件创造'
a = np.asarray(Image.open(OUT + r'\Jayden_去背景.png').convert('RGBA')).astype(np.float32) / 255.0
rgb = a[..., :3]
al = a[..., 3]
h, w, _ = a.shape
base = np.load(OUT + r'\canvas_base.npy')
H2, W2, _ = base.shape
L, T = 280, 185
Bs = 300
D = 150


def ss(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def segs_of(edge, thr=0.3, minlen=40):
    m = edge > thr
    segs = []
    s = None
    for y in range(len(m)):
        if m[y] and s is None:
            s = y
        if not m[y] and s is not None:
            if y - s >= minlen:
                segs.append((s, y - 1))
            s = None
    if s is not None and len(m) - s >= minlen:
        segs.append((s, len(m) - 1))
    return segs


def build_side(side, D=150, shear=0.16):
    ext = np.zeros((h, D, 3), np.float32)
    ea = np.zeros((h, D), np.float32)
    short_rows = np.zeros(h, bool)
    edge = al[:, 0] if side == 'L' else al[:, -1]
    xs = np.arange(D) + 0.5
    for (y0, y1) in segs_of(edge):
        span = y1 - y0
        if span < 300:
            short_rows[y0:y1 + 1] = True
        for y in range(y0, y1 + 1):
            u = (y - y0) / max(1, span)
            if span < 300:
                idx = (D - 1 - np.arange(D)) if side == 'L' else np.arange(D)
                ext[y, idx] = 0.0
                ea[y, idx] = 0.0
                continue
            reach = D * float(np.sin(np.pi * u) ** 0.8)
            if reach < 2:
                continue
            s = np.minimum(xs, reach - 0.001)
            xs_src = s if side == 'L' else (w - 1) - s
            ys_src = y + 1.1 * 0.55 * s
            i0 = np.clip(np.floor(ys_src).astype(int), 0, h - 1)
            i1 = np.clip(i0 + 1, 0, h - 1)
            fr = (ys_src - np.floor(ys_src))[:, None]
            xc = np.clip(np.round(xs_src).astype(int), 0, w - 1)
            col = rgb[i0, xc] * (1 - fr) + rgb[i1, xc] * fr
            py = int(np.clip(y + 40, 0, h - 1))
            band = rgb[py, 40:110] if side == 'L' else rgb[py, -110:-40]
            k = np.clip((s - reach * 0.55) / (reach * 0.45 + 1e-3), 0, 1)[:, None] * 0.30
            col = col * (1 - k) + band.mean(0) * k
            dist = reach - xs
            rim = np.exp(-((dist - 2.2) ** 2) / (2 * 1.9 ** 2))[:, None] * 0.55
            col = np.clip(col + rim * np.array([0.09, 0.07, 0.08]), 0, 1)
            idx = (D - 1 - np.arange(D)) if side == 'L' else np.arange(D)
            ext[y, idx] = col
            ea[y, idx] = ss((reach - xs) / 7.0)
    e_img = Image.fromarray((np.clip(ext, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7.0))
    a_img = Image.fromarray((np.clip(ea, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4.0))
    eb = np.asarray(e_img).astype(np.float32) / 255.0
    ab = np.asarray(a_img).astype(np.float32) / 255.0
    m3 = short_rows[:, None, None]
    m2 = short_rows[:, None]
    ext = np.where(m3, eb, ext)
    ea = np.where(m2, ab, ea)
    return ext, ea


eL, aL = build_side('L')
eR, aR = build_side('R')

a2 = al.copy()
ramp_x = ss(np.arange(w) / 50.0)
shortL = np.array([True] * h)
shortR = np.array([True] * h)
for (y0, y1) in segs_of(al[:, 0]):
    if y1 - y0 < 300:
        a2[y0:y1 + 1, :] *= ramp_x[None, :]
for (y0, y1) in segs_of(al[:, -1]):
    if y1 - y0 < 300:
        a2[y0:y1 + 1, :] *= ramp_x[::-1][None, :]

S = 190.0
BW = w + 2 * D
sk = np.zeros((Bs, BW, 4), np.float32)
xs2 = np.arange(BW)[None, :].astype(np.float32) - D
row = al[h - 1]
cols = np.where(row > 0.5)[0]
x0 = float(cols.min()) if len(cols) else 0.0
x1 = float(cols.max()) if len(cols) else float(w - 1)
for t in range(Bs):
    f = (t + 1) / Bs
    sy = h - 1 - t * (S / Bs)
    flare = 6.0 + 84.0 * (f ** 1.2)
    xL = x0 - flare
    xR = x1 + flare
    xc = np.clip(xs2[0], xL, xR)
    inside_left = xc < x0
    inside_right = xc > x1
    src = xc.copy()
    src[inside_left] = x0 + (xc[inside_left] - x0) * 0.8
    src[inside_right] = x1 + (xc[inside_right] - x1) * 0.8
    sy_map = np.clip(np.round(sy + 4.0 * np.sin(2 * np.pi * (xs2 / 500.0) + 1.5 * f)), 0, h - 1).astype(int)[0]
    src = np.clip(np.round(src + 6.0 * f * np.sin(2 * np.pi * (xs2 / 430.0) + 1.1 * f)), 0, w - 1).astype(int)[0]
    sk[t, :, :3] = rgb[sy_map, src]
    win = ss((xs2[0] - xL) / 38.0) * ss((xR - xs2[0]) / 38.0)
    seam = np.interp(xs2[0], np.arange(w), a2[h - 1])
    indr = ((xs2[0] >= x0 - 1) & (xs2[0] <= x1 + 1)).astype(np.float32)
    beta = max(0.0, 1.0 - t / 45.0)
    win = np.clip(win + seam * indr * beta, 0, 1)
    sk[t, :, 3] = al[sy_map, src] * np.clip(win, 0, 1)

sk_img = Image.fromarray((np.clip(sk[..., :3], 0, 1) * 255).astype(np.uint8))
blur = np.asarray(sk_img.filter(ImageFilter.GaussianBlur(9))).astype(np.float32) / 255.0
wgt = (np.arange(Bs)[:, None, None] / Bs) ** 1.3 * 0.45
sk[..., :3] = sk[..., :3] * (1 - wgt) + blur * wgt
sk[..., :3] *= (1 - 0.045 * (np.arange(Bs)[:, None, None] / Bs))

sub = np.zeros((H2, W2, 4), np.float32)
sub[T:T + h, L:L + w, :3] = rgb
sub[T:T + h, L:L + w, 3] = a2
sub[T:T + h, L - D:L, :3] = eL
sub[T:T + h, L - D:L, 3] = aL
sub[T:T + h, L + w:L + w + D, :3] = eR
sub[T:T + h, L + w:L + w + D, 3] = aR
sub[T + h:T + h + Bs, L - D:L - D + BW] = sk

canvas = base * (1 - sub[..., 3:4]) + sub[..., :3] * sub[..., 3:4]
img = Image.fromarray((np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8))
img.save(OUT + r'\Jayden_扩图.png', optimize=True)
img.save(OUT + r'\Jayden_扩图.jpg', quality=95, subsampling=1)
cut = Image.fromarray((np.clip(sub, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
cut.save(OUT + r'\Jayden_抠图_扩图版.png', optimize=True)
print(img.size, cut.size)
