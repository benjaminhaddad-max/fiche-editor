export function getPdfStyles(): string {
  return `
    @page {
      size: A4;
      margin: 15mm 12mm 22mm 12mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', 'Arial', sans-serif;
      font-size: 9pt;
      line-height: 1.4;
      color: #1a1a1a;
    }

    /* ===== COVER PAGE ===== */
    .cover-page {
      page-break-after: always;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .cover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 0 10px 0;
      border-bottom: 2px solid #333;
      margin-bottom: 20px;
    }

    .cover-logo {
      font-size: 22pt;
      font-weight: 900;
      color: #1a1a1a;
    }

    .cover-logo-sub {
      font-size: 8pt;
      color: #666;
    }

    .cover-revisions {
      display: flex;
      gap: 4px;
    }

    .cover-revision-box {
      width: 20px;
      height: 20px;
      border: 1px solid #999;
      display: inline-block;
    }

    .cover-meta {
      text-align: right;
    }

    .cover-annee {
      font-size: 10pt;
      font-weight: bold;
    }

    .cover-faculte {
      font-size: 9pt;
      color: #444;
      border: 1px solid #999;
      padding: 2px 8px;
      display: inline-block;
      margin-top: 2px;
    }

    .cover-title-band {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f5f5f5;
      border: 2px solid #333;
      padding: 12px 16px;
      margin-bottom: 20px;
    }

    .cover-matiere {
      font-size: 14pt;
      font-weight: 900;
    }

    .cover-fiche-numero {
      font-size: 11pt;
      font-weight: bold;
      background: #333;
      color: white;
      padding: 4px 16px;
      border-radius: 4px;
    }

    .cover-titre {
      font-size: 12pt;
      font-style: italic;
      color: #333;
    }

    .cover-plan {
      border: 1px solid #ddd;
      padding: 16px 20px;
      margin-bottom: 20px;
      flex: 1;
    }

    .cover-plan h2 {
      font-size: 13pt;
      font-weight: bold;
      margin-bottom: 12px;
    }

    .cover-plan ol {
      list-style: none;
      padding: 0;
    }

    .cover-plan li {
      padding: 3px 0;
      font-size: 10pt;
    }

    .cover-plan li span.num {
      font-weight: bold;
      margin-right: 12px;
      min-width: 30px;
      display: inline-block;
    }

    .cover-legende {
      border: 1px solid #ddd;
      padding: 12px 16px;
    }

    .cover-legende h2 {
      font-size: 10pt;
      font-weight: bold;
      margin-bottom: 8px;
    }

    .cover-legende-items {
      display: flex;
      gap: 24px;
      font-size: 8pt;
      font-style: italic;
      color: #555;
    }

    /* ===== CONTENT PAGES ===== */
    .pdf-section {
      margin-bottom: 12px;
      page-break-inside: avoid;
    }

    .pdf-section-header {
      color: white;
      padding: 6px 10px;
      font-weight: bold;
      font-size: 9pt;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .pdf-section-num {
      font-weight: 900;
    }

    .pdf-section-subtitle {
      font-weight: normal;
      font-size: 9pt;
    }

    .pdf-section-body {
      border: 0.5pt solid #333;
      border-top: none;
    }

    .pdf-topic-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      border-bottom: 0.5pt solid #ccc;
    }

    .pdf-topic-row:last-child {
      border-bottom: none;
    }

    .pdf-topic-label {
      background-color: #f5f5f5;
      border-right: 0.5pt solid #ccc;
      padding: 4px 6px;
      font-weight: 700;
      font-size: 8pt;
      color: #333;
      word-break: break-word;
    }

    .pdf-topic-content {
      padding: 4px 8px;
      font-size: 8.5pt;
    }

    .pdf-topic-content p {
      margin: 1px 0;
    }

    .pdf-topic-content ul {
      list-style: none;
      padding-left: 12px;
      margin: 2px 0;
    }

    .pdf-topic-content ul > li::before {
      content: "\\2022  ";
      font-weight: bold;
    }

    .pdf-topic-content ul ul > li::before {
      content: "o  ";
      font-weight: normal;
    }

    .pdf-topic-content ul ul ul > li::before {
      content: "\\00A7  ";
      font-weight: normal;
    }

    .pdf-topic-content ol {
      padding-left: 16px;
      margin: 2px 0;
    }

    /* ===== Nested Sub-Table ===== */
    .pdf-sub-table {
      border: 0.5pt solid #999;
      margin: 4px 0;
    }

    .pdf-sub-row {
      display: grid;
      grid-template-columns: 90px 1fr;
      border-bottom: 0.5pt solid #ccc;
    }

    .pdf-sub-row:last-child {
      border-bottom: none;
    }

    .pdf-sub-label {
      background-color: #f0f0f0;
      border-right: 0.5pt solid #ccc;
      padding: 3px 5px;
      font-weight: 600;
      font-size: 7.5pt;
    }

    .pdf-sub-content {
      padding: 3px 5px;
      font-size: 8pt;
    }

    .pdf-sub-content p {
      margin: 1px 0;
    }

    /* ===== Annotations ===== */
    .pdf-annotation {
      font-size: 7pt;
    }

    .pdf-annotation-notion-nouvelle {
      color: #b8860b;
    }

    .pdf-annotation-tombee-concours {
      color: #2563eb;
    }

    .pdf-annotation-astuce {
      color: #16a34a;
    }

    /* ===== Text Styles ===== */
    strong {
      font-weight: 700;
    }

    mark {
      border-radius: 1px;
      padding: 0 1px;
    }
  `
}
