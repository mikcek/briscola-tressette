from PIL import Image
import numpy as np
from pathlib import Path

src = Path(r'C:\Users\miche\Documents\SVILUPPO GIOCHI\BRISCOLA\1280px-Carte_piacentine_al_completo.webp')
im = Image.open(src).convert('RGB')
arr = np.array(im)
h, w = arr.shape[:2]
white = np.all(arr > 250, axis=2)

# For each row, fraction white
row_white = white.mean(axis=1)
# Print peaks of whiteness (possible separators)
for y in range(h):
    if row_white[y] > 0.92:
        print(f'y={y} white={row_white[y]:.3f}')

print('--- cols nearly white ---')
col_white = white.mean(axis=0)
for x in range(w):
    if col_white[x] > 0.92:
        print(f'x={x} white={col_white[x]:.3f}')
