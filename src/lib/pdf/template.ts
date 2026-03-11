import { toRoman } from '@/lib/editor/utils'
import { getPdfStyles } from './styles'
import { serializeToHtml } from '@/lib/editor/serializer'
import { extractPlan } from '@/lib/editor/plan-extractor'
import type { Fiche } from '@/lib/types/fiche'

function renderCoverPage(fiche: Fiche, plan: ReturnType<typeof extractPlan>): string {
  const revisionBoxes = Array.from({ length: 7 }, () => '<span class="cover-revision-box"></span>').join('')

  const planItems = plan
    .map(
      (item) =>
        `<li><span class="num">${toRoman(item.number)}.</span>${escapeHtml(item.title)}</li>`
    )
    .join('')

  return `
    <div class="cover-page">
      <div class="cover-header">
        <div>
          <div class="cover-logo">Diploma<br/>Sante</div>
          <div class="cover-logo-sub">la prepa medecine</div>
        </div>
        <div>
          <div style="font-weight:bold;font-size:9pt;margin-bottom:4px;">REVISIONS</div>
          <div class="cover-revisions">${revisionBoxes}</div>
        </div>
        <div class="cover-meta">
          <div class="cover-annee">${escapeHtml(fiche.annee)}</div>
          <div class="cover-faculte">${escapeHtml(fiche.faculte)}</div>
        </div>
      </div>

      <div class="cover-title-band">
        <div class="cover-matiere">${escapeHtml(fiche.matiere)}</div>
        <div class="cover-fiche-numero">FICHE<br/>${fiche.numero}</div>
        <div class="cover-titre">${escapeHtml(fiche.titre)}</div>
      </div>

      <div class="cover-plan">
        <h2>PLAN</h2>
        <ol>${planItems}</ol>
      </div>

      <div class="cover-legende">
        <h2>LEGENDE</h2>
        <div class="cover-legende-items">
          <span>\u26A1 Notion nouvelle</span>
          <span>\uD83C\uDFAF Notion deja tombee au concours</span>
          <span>\uD83D\uDCA1 Astuces et methode</span>
        </div>
      </div>
    </div>
  `
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPdfHtml(fiche: Fiche): string {
  const plan = extractPlan(fiche.content as Parameters<typeof extractPlan>[0])
  const coverHtml = renderCoverPage(fiche, plan)
  const contentHtml = serializeToHtml(fiche.content as Parameters<typeof serializeToHtml>[0])
  const css = getPdfStyles()

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>${css}</style>
</head>
<body>
  ${coverHtml}
  <div class="content-pages">
    ${contentHtml}
  </div>
</body>
</html>`
}
