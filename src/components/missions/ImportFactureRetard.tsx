"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Card } from "@/components/ui/Page";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { ImportResult } from "@/app/(app)/declarations/actions";

/**
 * Vercel plafonne le corps d'une requête à 4,5 Mo : au-delà, l'action serveur
 * n'est jamais appelée et le navigateur affiche une erreur qu'on ne maîtrise
 * pas. On garde de la marge pour le reste du formulaire.
 */
const POIDS_MAX = 3.5 * 1024 * 1024;

/** Côté le plus long gardé : au-delà, la lecture réduit l'image de son côté. */
const COTE_MAX = 1600;

const estImage = (f: File) =>
  f.type.startsWith("image/") ||
  /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);

/**
 * Une facture photographiée au téléphone pèse souvent plus que la limite, et
 * un iPhone la livre en HEIC, que l'API ne lit pas. On la redessine donc dans
 * un canvas : elle en ressort en JPEG, à une taille utile pour la lecture.
 */
async function allegerPhoto(fichier: File): Promise<File> {
  const image = await createImageBitmap(fichier);
  const facteur = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * facteur);
  canvas.height = Math.round(image.height * facteur);
  const ctx = canvas.getContext("2d");
  if (!ctx) return fichier;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, "image/jpeg", 0.85),
  );
  if (!blob) return fichier;
  return new File([blob], `${fichier.name.replace(/\.[^.]+$/, "")}.jpg`, {
    type: "image/jpeg",
  });
}

/**
 * Importer la facture d'un intervenant qui l'a envoyée en retard.
 *
 * Elle est lue, pas enregistrée : ses lignes atterrissent dans le
 * formulaire juste en dessous, où elles se relisent et se corrigent avant
 * d'être déclarées. C'est ce qui évite de tout retaper sans pour autant
 * payer sur la foi d'un PDF.
 *
 * L'état vit dans le formulaire parent, qui remplit ses lignes à la
 * réception d'une lecture ; cette carte ne fait que l'afficher — et reste
 * un formulaire voisin, puisqu'un formulaire ne s'imbrique pas.
 */
export function ImportFactureRetard({
  formAction,
  state,
}: {
  formAction: (fd: FormData) => void;
  state: ImportResult;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  async function auChoix() {
    const fichier = champ.current?.files?.[0];
    setNote(null);
    if (!fichier || !estImage(fichier)) return;
    setNote("Préparation de la photo…");
    try {
      const allegee = await allegerPhoto(fichier);
      const transfert = new DataTransfer();
      transfert.items.add(allegee);
      if (champ.current) champ.current.files = transfert.files;
      setNote(`Photo prête (${Math.round(allegee.size / 1024)} Ko).`);
    } catch {
      setNote(
        fichier.size > POIDS_MAX
          ? "Cette photo est trop lourde pour être envoyée. Enregistrez la facture en PDF, ou réduisez la photo."
          : null,
      );
    }
  }

  return (
    <Card className="p-5">
      <form action={formAction} className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
            <FileUp size={15} />
            Importer une facture envoyée en retard
          </h2>
          <p className="mt-1 text-sm text-muted">
            Déposez le PDF ou une photo de la facture : elle est lue et ses
            lignes remplissent le formulaire ci-dessous. Rien n’est enregistré
            avant que vous ne déclariez.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={champ}
            type="file"
            name="facture"
            accept="application/pdf,image/*"
            required
            onChange={auChoix}
            className="block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80"
          />
          <SubmitButton
            variant="secondary"
            pendingLabel="Lecture de la facture…"
          >
            Lire la facture
          </SubmitButton>
        </div>
        {note && <p className="text-xs text-muted">{note}</p>}
        {state.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.resume && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {state.resume}
          </p>
        )}
      </form>
    </Card>
  );
}
