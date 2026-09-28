# Logo Linova — fichiers vectoriels

Extraits **en vectoriel** de la charte graphique officielle (`LNV-Chartegraphique.pdf`),
sans aucune modification des tracés — la charte l'interdit expressément.

| Fichier | Contenu | Usage |
|---|---|---|
| `linova-complet.svg` | Logotype + baseline « De la formation à la vocation » | Dès que la baseline est lisible |
| `linova-logotype.svg` | Logotype seul | Petites tailles, et base des verrouillages « Lab » |
| `linova-isotype.svg` | Le « O » à la coche | Favicon, icône d'application, avatar |

## Couleur

Les tracés sont en `currentColor` : la couleur se pilote par CSS, sans toucher au fichier.

```html
<img src="/logo/linova-logotype.svg" alt="Linova">        <!-- noir par défaut -->
<div style="color:#6da3a4"><!-- svg inline --></div>       <!-- bleu lagon -->
```

Teintes de la charte : bleu lagon `#6da3a4`, jaune vif `#e6dc40`, bleu nuit `#182d3c`,
noir charbon `#222222`, blanc cassé `#efefef`.

## Règles à respecter

- Ne jamais déformer le logo, ni changer la graisse ou la casse de la typographie.
- Si deux couleurs sont employées, la seconde n'apparaît que sur le « L » de l'isotype.
- Zone de protection de 4 × 4 mm autour du logo : aucun élément ne doit y entrer.
- Taille minimale : 30 mm de largeur.

Polices : **Gilroy** et **Aquatico** en print (licences payantes), **Outfit** et
**Quicksand** pour le web (disponibles sur Google Fonts).
