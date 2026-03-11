import type { Fiche } from '@/lib/types/fiche'
import { buildPdfHtml } from './template'

export async function generatePdf(fiche: Fiche): Promise<Buffer> {
  const html = buildPdfHtml(fiche)

  const { chromium } = await import('playwright-core')

  // In dev, use locally installed Chrome
  const possiblePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ]

  const { existsSync } = await import('fs')
  const executablePath = possiblePaths.find((p) => existsSync(p))

  const browser = await chromium.launch({
    headless: true,
    executablePath,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '15mm',
        bottom: '25mm',
        left: '12mm',
        right: '12mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size:7pt; width:100%; display:flex; justify-content:space-between; padding:0 12mm; color:#666;">
          <span style="font-weight:bold;">Diploma Sante</span>
          <span style="font-weight:bold;">${fiche.faculte.toUpperCase()}</span>
          <span><span class="pageNumber"></span>/<span class="totalPages"></span></span>
        </div>
      `,
      printBackground: true,
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
