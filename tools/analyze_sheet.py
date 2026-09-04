from PIL import Image
import numpy as np
from pathlib import Path

src = Path(r'C:\Users\miche\Documents\SVILUPPO GIOCHI\BRISCOLA\1280px-Carte_piacentine_al_completo.webp')
out_dir = Path(r'C:\Users\miche\Documents\SVILUPPO GIOCHI\BRISCOLA\cards')
out_dir.mkdir(exist_ok=True)

im = Image.open(src).convert('RGB')
arr = np.array(im)
h, w = arr.shape[:2]
print('size', w, h)

white = np.all(arr > 245, axis=2)
col_has = ~np.all(white, axis=0)
row_has = ~np.all(white, axis=1)
xs = np.where(col_has)[0]
ys = np.where(row_has)[0]
print('content x', xs[0], xs[-1])
print('content y', ys[0], ys[-1])

coldark = (~white).mean(axis=0)
rowdark = (~white).mean(axis=1)

def runs(mask):
    idx = np.where(mask)[0]
    if len(idx) == 0:
        return []
    gaps = np.where(np.diff(idx) > 1)[0]
    starts = np.insert(idx[gaps + 1], 0, idx[0])
    ends = np.append(idx[gaps], idx[-1])
    return list(zip(starts.tolist(), ends.tolist()))

cg = runs(coldark < 0.02)
rg = runs(rowdark < 0.02)
print('col gutters', len(cg))
for g in cg:
    print('  c', g, 'w', g[1]-g[0]+1)
print('row gutters', len(rg))
for g in rg:
    print('  r', g, 'h', g[1]-g[0]+1)

# Also try equal split on content bbox
x0, x1 = int(xs[0]), int(xs[-1]) + 1
y0, y1 = int(ys[0]), int(ys[-1]) + 1
cw = (x1 - x0) / 10
ch = (y1 - y0) / 4
print('bbox', x0, y0, x1, y1, 'cell', cw, ch)
