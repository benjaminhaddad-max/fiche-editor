#!/bin/bash
#
# Recopie vers linova-invoice les variables communes aux deux écoles.
#
#   bash scripts/env-linova.sh
#
# Les deux déploiements partagent la même base, le même Brevo, le même
# Pennylane : ces valeurs-là sont identiques. Seules la marque, l'adresse du
# site et l'expéditeur changent, et elles sont déjà posées.
#
# Les NEXT_PUBLIC_COMPANY_* ne sont pas reprises : les coordonnées de Linova
# Formation sont écrites dans src/lib/brand/config.ts, relevées au registre.
#
# À lancer depuis la racine du dépôt. Rien n'est affiché à l'écran : les
# valeurs passent de .env.local à Vercel sans transiter par le terminal.
set -euo pipefail

SRC=".env.local"
[ -f "$SRC" ] || { echo "✗ $SRC introuvable — lancez depuis la racine du dépôt."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npx --yes vercel link --yes --project linova-invoice >/dev/null

PARTAGEES=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  BREVO_API_KEY
  PENNYLANE_API_TOKEN
  ANTHROPIC_API_KEY
  LAB_SUPABASE_URL
  LAB_SUPABASE_SERVICE_KEY
  INVITATION_DAYS
  CRON_SECRET
)

manquantes=0
for n in "${PARTAGEES[@]}"; do
  v="$(grep -E "^$n=" "$OLDPWD/$SRC" | head -1 | cut -d= -f2- || true)"
  if [ -z "$v" ]; then
    echo "  ⚠ $n absente de $SRC — à poser à la main"
    manquantes=$((manquantes + 1))
    continue
  fi
  printf '%s' "$v" | npx --yes vercel env add "$n" production --force >/dev/null 2>&1
  echo "  ✓ $n"
done

echo
npx --yes vercel env ls production 2>/dev/null | sed -n '3,40p'
echo
if [ "$manquantes" -gt 0 ]; then
  echo "$manquantes variable(s) restent à poser à la main."
else
  echo "Toutes les variables partagées sont en place."
fi
echo "Il reste à brancher le domaine facturation.linova-education.fr sur le projet."
