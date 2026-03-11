import { toRoman } from '@/lib/editor/utils'
import { getPdfStyles } from './styles'
import { serializeToHtml } from '@/lib/editor/serializer'
import { extractPlan } from '@/lib/editor/plan-extractor'
import { logoBase64, lightningBase64, lightbulbBase64, bullseyeBase64, logoSmallBase64 } from './images'
import type { Fiche } from '@/lib/types/fiche'

export function renderCoverPage(fiche: Fiche, plan: ReturnType<typeof extractPlan>): string {
  const revisionBoxes = Array.from({ length: 6 }, () => '<span class="cover-revision-box"></span>').join('')

  const planItems = plan
    .map(
      (item) =>
        `<li><span class="plan-num">${toRoman(item.number)}.</span><span class="plan-text">${escapeHtml(item.title)}</span></li>`
    )
    .join('')

  return `
    <div class="cover-page">
      <!-- Header band -->
      <div class="cover-header">
        <div class="cover-header-top">
          <img class="cover-logo" src="${logoBase64}" alt="Diploma Santé" />
          <div class="cover-header-right">
            <div class="cover-revisions-label">révisions</div>
            <div class="cover-revisions">${revisionBoxes}</div>
          </div>
        </div>
        <div class="cover-header-bottom">
          <div class="cover-meta-left">
            <span class="cover-faculte">${escapeHtml(fiche.faculte)}</span>
          </div>
          <div class="cover-meta-right">
            <span class="cover-annee">${escapeHtml(fiche.annee)}</span>
          </div>
        </div>
      </div>

      <!-- Fiche identification -->
      <div class="cover-fiche-row">
        <div class="cover-matiere">${escapeHtml(fiche.matiere)}</div>
        <div class="cover-fiche-numero">
          <span class="fiche-label">fiche</span>
          <span class="fiche-number">${fiche.numero}</span>
        </div>
        <div class="cover-titre">${escapeHtml(fiche.titre)}</div>
      </div>

      <!-- Plan -->
      <div class="cover-plan">
        <ol>${planItems}</ol>
      </div>

      <!-- Légende -->
      <div class="cover-legende">
        <div class="cover-legende-title">LÉGENDE</div>
        <div class="cover-legende-items">
          <div class="cover-legende-item">
            <img src="${bullseyeBase64}" class="legende-icon" alt="" />
            <span>Notion déjà tombée au concours</span>
          </div>
          <div class="cover-legende-item">
            <img src="${lightningBase64}" class="legende-icon" alt="" />
            <span>Notion nouvelle</span>
          </div>
          <div class="cover-legende-item">
            <img src="${lightbulbBase64}" class="legende-icon" alt="" />
            <span>Astuces et méthode</span>
          </div>
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
