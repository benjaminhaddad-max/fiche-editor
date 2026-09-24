"""
Le logo Diploma Invoice, construit à partir de celui de Diploma Lab.

Le symbole et le mot « Diploma » sont les pixels d'origine, découpés tels
quels. Seul « Invoice » est redessiné, dans la fonte qui recale « Diploma »
(1104 px) et « Lab » (474 px) du fichier source à un pixel près.

Sortie : deux PNG à fond transparent, l'un en crème pour les fonds foncés,
l'autre en navy pour les fonds clairs.
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np

SRC = "/Users/benjaminhaddad-diplomasante/Desktop/Plateformes Ben/EXOTEACHBIS-main/public/logo-diploma-lab-header.png"
SORTIE = "/Users/benjaminhaddad-diplomasante/Desktop/Plateformes Ben/fiche-editor/public"

# Relevés sur le fichier source.
MARQUE = (20, 20, 253, 259)          # symbole
DIPLOMA = (316, 38, 1421, 235)       # première ligne
CAP_HAUT_2 = 273                     # haut de la capitale de la seconde ligne
TAILLE = 270          # capitale de 192 px, comme le fichier source
FONTE = "/System/Library/Fonts/Avenir Next.ttc"   # fût de 20 px, au plus près des 22 px d'origine

# --- alpha du fichier source : fond navy plat, encre blanche
a = np.array(Image.open(SRC).convert("RGB")).astype(float)
fond = a[2, 2]
alpha = np.clip((a.mean(axis=2) - fond.mean()) / (255 - fond.mean()), 0, 1)

def decouper(b):
    x0, y0, x1, y1 = b
    return alpha[y0:y1, x0:x1]

marque, diploma = decouper(MARQUE), decouper(DIPLOMA)

# --- « Invoice », dessiné à la même capitale que « Lab »
idx = next(i for i in range(14) if ImageFont.truetype(FONTE, 40, index=i).getname()[1] == 'Regular')

def largeur(mot, tr):
    f = ImageFont.truetype(FONTE, TAILLE, index=idx)
    im = Image.new("L", (4500, 900), 0); d = ImageDraw.Draw(im)
    x = 200.0
    for ch in mot:
        d.text((x, 200), ch, font=f, fill=255)
        x += d.textlength(ch, font=f) + tr
    m = np.array(im) > 128
    _, xs = np.where(m)
    return xs.max() - xs.min() + 1

# L'interlettrage se règle sur « Diploma » : six intervalles, donc une
# mesure par intervalle bien plus sûre que sur les deux de « Lab ». Calé sur
# trois lettres, l'écart de chasse entre les deux fontes se reporterait
# entièrement sur les gouttières et « Invoice » partirait en morceaux.
lo, hi = -10.0, 80.0
for _ in range(24):
    mid = (lo + hi) / 2
    if largeur("Diploma", mid) < 1104: lo = mid
    else: hi = mid
TRACKING = round((lo + hi) / 2, 2)
print("interlettrage calé sur « Diploma » :", TRACKING)

f = ImageFont.truetype(FONTE, TAILLE, index=idx)
tmp = Image.new("L", (4500, 900), 0)
d = ImageDraw.Draw(tmp)
x = 200.0
for ch in "Invoice":
    d.text((x, 200), ch, font=f, fill=255)
    x += d.textlength(ch, font=f) + TRACKING
arr = np.array(tmp).astype(float) / 255
ys, xs = np.where(arr > 0.5)
# On cale sur la capitale « I » : son sommet donne la ligne de référence.
haut_cap = ys.min()
invoice = arr[haut_cap:ys.max()+1, xs.min():xs.max()+1]
print("« Invoice » :", invoice.shape[1], "px de large,", invoice.shape[0], "de haut")

# --- composition, aux coordonnées du fichier source
L = 316 + max(diploma.shape[1], invoice.shape[1]) + 20
H = max(CAP_HAUT_2 + invoice.shape[0] + 20, MARQUE[3] + 20)
canevas = np.zeros((H, L))

def poser(bloc, x, y):
    h, w = bloc.shape
    canevas[y:y+h, x:x+w] = np.maximum(canevas[y:y+h, x:x+w], bloc)

poser(marque, MARQUE[0], MARQUE[1])
poser(diploma, DIPLOMA[0], DIPLOMA[1])
poser(invoice, 316, CAP_HAUT_2)

for nom, (r, v, b) in [("logo-diploma-invoice.png", (247, 244, 238)), ("logo-diploma-invoice-navy.png", (14, 30, 53))]:
    img = np.zeros((H, L, 4), dtype=np.uint8)
    img[..., 0], img[..., 1], img[..., 2] = r, v, b
    img[..., 3] = (canevas * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(f"{SORTIE}/{nom}")
    print("écrit :", nom, f"{L}×{H}")
