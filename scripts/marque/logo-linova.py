"""
Le logo Linova Invoice, construit à partir du logo officiel de Linova.

Le mot « LINOVA » est repris tel quel — ce sont les pixels du fichier
distribué par linova-education.fr, coche verte comprise. Seul « Invoice »
est redessiné, dans une fonte choisie sur la graisse du trait plutôt que
sur la largeur : c'est le fût qui trahit une fonte trop grasse, pas la
chasse. Les proportions des deux lignes sont relevées sur le logo Diploma
Invoice, pour que les deux écoles aient la même architecture.

Sortie : deux PNG à fond transparent, l'un clair pour les fonds foncés,
l'autre foncé pour les fonds clairs.
"""
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RACINE = Path("/Users/benjaminhaddad-diplomasante/Desktop/Plateformes Ben/fiche-editor")
SORTIE = RACINE / "public"
SOURCE = "https://linova-education.fr/images/logos/logo-sans-baseline-noir-bleu.svg"
REFERENCE = SORTIE / "logo-diploma-invoice-navy.png"

# Couleurs relevées dans le fichier source et dans la feuille de style du
# site : l'encre du mot, et le vert de la coche.
ENCRE = (33, 33, 33)
ACCENT = (110, 163, 165)
CLAIR = (247, 244, 238)

FONTE = "/System/Library/Fonts/Avenir Next.ttc"


def rasteriser(svg: bytes, cote: int = 2400) -> np.ndarray:
    """SVG → tableau RGB, via l'aperçu de macOS (pas de rasteriseur tiers ici)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "logo.svg"
        src.write_bytes(svg)
        subprocess.run(
            ["qlmanage", "-t", "-s", str(cote), "-o", tmp, str(src)],
            check=True, capture_output=True,
        )
        rendu = next(Path(tmp).glob("*.png"))
        return np.array(Image.open(rendu).convert("RGB")).astype(float)


def encre_de(rgb: np.ndarray) -> np.ndarray:
    """Le fond est blanc : l'opacité, c'est l'écart au blanc."""
    return np.clip((255 - rgb.mean(axis=2)) / 255 * 1.6, 0, 1)


def recadrer(masque: np.ndarray, seuil: float = 0.05):
    ys, xs = np.where(masque > seuil)
    return masque[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def fut(masque: np.ndarray) -> float:
    """
    Épaisseur du trait, mesurée sur un « I » seul.

    Mesurer sur le mot entier revient à mélanger les fûts, les diagonales et
    les panses : les rondes comptent large et l'ordre des graisses s'inverse
    — une Ultra Light ressortait plus grasse qu'une Medium. Le « I » est un
    trait vertical nu, la seule lettre qui réponde vraiment à la question.
    """
    m = masque > 0.5
    # Le masque est recadré au ras de l'encre : sans une colonne vide de
    # chaque côté, un trait qui touche le bord n'a pas de front montant et
    # ne se compte pas du tout.
    m = np.pad(m, ((0, 0), (1, 1)))
    milieu = m[m.shape[0] // 3: 2 * m.shape[0] // 3]
    largeurs = []
    for ligne in milieu:
        d = np.diff(ligne.astype(int))
        debuts, fins = np.where(d == 1)[0], np.where(d == -1)[0]
        n = min(len(debuts), len(fins))
        largeurs += [f - d0 for d0, f in zip(debuts[:n], fins[:n]) if f > d0]
    return float(np.median(largeurs)) if largeurs else 0.0


# ---------------------------------------------------------------- proportions
# Sur le logo Diploma, la première ligne contient aussi le symbole, plus haut
# que les lettres : son gabarit ne se transpose donc pas tel quel à Linova,
# qui n'a pas de symbole. On garde la seule proportion transposable — les
# deux lignes alignées sur la même largeur — et on fixe la hauteur de la
# seconde à un peu plus de la moitié de la première, ce que donne le logo
# Diploma une fois le symbole retiré.
RATIO_CAP = 0.58

# ------------------------------------------------------------------- « LINOVA »
import urllib.request

svg = urllib.request.urlopen(SOURCE).read()
rgb = rasteriser(svg)
plein = encre_de(rgb)
ys, xs = np.where(plein > 0.05)
boite = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
mot = plein[boite[1]:boite[3], boite[0]:boite[2]]

# La coche est le seul élément vert : on la garde à part pour la recolorer
# autrement que le mot.
zone = rgb[boite[1]:boite[3], boite[0]:boite[2]]
vert = (np.abs(zone - np.array(ACCENT)).sum(axis=2) < 120) & (mot > 0.05)
noir = (mot > 0.05) & ~vert
# Le « I » de LINOVA : deuxième lettre, isolée par les colonnes vides.
_col = (mot > 0.05).sum(axis=0)
_vides, _deb = [], None
for _i, _v in enumerate(_col == 0):
    if _v and _deb is None:
        _deb = _i
    if not _v and _deb is not None:
        if _i - _deb > 20:
            _vides.append((_deb, _i))
        _deb = None
FUT_LINOVA = float(_vides[1][0] - _vides[0][1])
print(f"« LINOVA » : {mot.shape[1]}×{mot.shape[0]} px, fût du « I » {FUT_LINOVA:.0f} px")

# ------------------------------------------------------------------ « Invoice »
CAP = int(round(mot.shape[0] * RATIO_CAP))
CIBLE = mot.shape[1]   # les deux lignes se terminent au même fer


def rendre(mot_txt: str, taille: int, index: int, tracking: float) -> np.ndarray:
    f = ImageFont.truetype(FONTE, taille, index=index)
    im = Image.new("L", (taille * 12, taille * 4), 0)
    d = ImageDraw.Draw(im)
    x = float(taille)
    for ch in mot_txt:
        d.text((x, taille), ch, font=f, fill=255)
        x += d.textlength(ch, font=f) + tracking
    return recadrer(np.array(im).astype(float) / 255)


# La fonte se choisit sur la graisse, mesurée à la taille où elle servira.
# Mesurer à une taille puis composer à une autre donnait un « Invoice »
# filiforme à côté de « LINOVA » : le rapport du fût à la hauteur ne se
# conserve pas d'un corps à l'autre dans une fonte à optique variable.
fut_voulu = FUT_LINOVA * RATIO_CAP


def taille_pour_cap(index: int) -> int:
    lo, hi = 10, 1600
    for _ in range(30):
        mid = (lo + hi) // 2
        if rendre("Invoice", mid, index, 0).shape[0] < CAP:
            lo = mid
        else:
            hi = mid
    return lo


candidats = []
for i in range(14):
    try:
        nom = ImageFont.truetype(FONTE, 40, index=i).getname()
    except Exception:
        continue
    # Linova n'a pas une lettre penchée : une italique est écartée d'office,
    # sinon la comparaison des fûts la fait gagner sur sa seule finesse.
    if "Italic" in nom[1] or "Oblique" in nom[1]:
        continue
    t = taille_pour_cap(i)
    e = fut(rendre("I", t, i, 0))
    candidats.append((abs(e - fut_voulu), i, nom[1], t, e))
candidats.sort()
_, INDEX, STYLE, TAILLE, FUT_OBTENU = candidats[0]
print(f"fonte retenue pour « Invoice » : {STYLE} — fût {FUT_OBTENU:.0f} px "
      f"(visé {fut_voulu:.0f})")
for ecart, _, st, _, e in candidats[:4]:
    print(f"    {st:<14} fût {e:>5.1f}  écart {ecart:5.1f}")

# Interlettrage : on étire « Invoice » jusqu'à la largeur voulue. Linova
# espace largement ses capitales ; une seconde ligne serrée jurerait.
lo_t, hi_t = -20.0, 400.0
for _ in range(30):
    mid = (lo_t + hi_t) / 2
    if rendre("Invoice", TAILLE, INDEX, mid).shape[1] < CIBLE:
        lo_t = mid
    else:
        hi_t = mid
TRACKING = round((lo_t + hi_t) / 2, 2)
invoice = rendre("Invoice", TAILLE, INDEX, TRACKING)
print(f"« Invoice » : {invoice.shape[1]}×{invoice.shape[0]} px "
      f"(visé {CIBLE}×{CAP}), interlettrage {TRACKING}")

# ------------------------------------------------------------------ composition
GOUTTIERE = int(round(mot.shape[0] * 0.42))
L = max(mot.shape[1], invoice.shape[1])
H = mot.shape[0] + GOUTTIERE + invoice.shape[0]


def poser(cible, bloc, x, y):
    h, w = bloc.shape
    cible[y:y + h, x:x + w] = np.maximum(cible[y:y + h, x:x + w], bloc)


canal_mot = np.zeros((H, L))
canal_accent = np.zeros((H, L))
poser(canal_mot, np.where(noir, mot, 0), 0, 0)
poser(canal_accent, np.where(vert, mot, 0), 0, 0)
poser(canal_mot, invoice, 0, mot.shape[0] + GOUTTIERE)

for nom, encre in [("logo-linova-invoice.png", CLAIR), ("logo-linova-invoice-navy.png", ENCRE)]:
    img = np.zeros((H, L, 4), dtype=np.uint8)
    # La coche garde son vert des deux côtés : c'est le seul signe de couleur
    # de la marque, et ce vert moyen tient aussi bien sur le navy que sur le
    # blanc. La neutraliser sur fond foncé revenait à la rendre grise.
    a = np.maximum(canal_mot, canal_accent)
    for c in range(3):
        img[..., c] = np.where(canal_accent > canal_mot, ACCENT[c], encre[c])
    img[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(SORTIE / nom)
    Image.fromarray(img, "RGBA").save(SORTIE / nom.replace(".png", ".webp"), "WEBP", lossless=True)
    print("écrit :", nom, f"{L}×{H}")
