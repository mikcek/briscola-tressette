"""Ritaglia le 40 carte piacentine dal foglio completo (dimensioni uniformi)."""
from pathlib import Path
from PIL import Image

SRC = Path(r'C:\Users\miche\Documents\SVILUPPO GIOCHI\BRISCOLA\1280px-Carte_piacentine_al_completo.webp')
OUT = Path(r'C:\Users\miche\Documents\SVILUPPO GIOCHI\BRISCOLA\cards')

SUITS = ['denari', 'coppe', 'bastoni', 'spade']
RANKS = ['asso', '2', '3', '4', '5', '6', '7', 'fante', 'cavallo', 're']

# Dimensione finale standard (proporzione ~ piacentine)
OUT_W, OUT_H = 248, 432
PAD = 3

OUT.mkdir(exist_ok=True)
im = Image.open(SRC).convert('RGBA')
w, h = im.size
cols, rows = 10, 4

for r, suit in enumerate(SUITS):
    for c, rank in enumerate(RANKS):
        x0 = c * w // cols
        x1 = (c + 1) * w // cols
        y0 = r * h // rows
        y1 = (r + 1) * h // rows
        card = im.crop((x0, y0, x1, y1))
        cw, ch = card.size
        card = card.crop((PAD, PAD, cw - PAD, ch - PAD))
        card = card.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
        card.save(OUT / f'{suit}_{rank}.png', 'PNG', optimize=True)

print(f'OK: 40 carte in {OUT} ({OUT_W}x{OUT_H})')
