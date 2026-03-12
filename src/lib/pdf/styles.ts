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

    /* --- Header --- */
    .cover-header {
      margin-bottom: 12px;
    }

    .cover-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #A5A5A5;
      padding: 10px 16px;
    }

    .cover-logo {
      height: 38px;
      width: auto;
    }

    .cover-header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .cover-revisions-label {
      font-size: 9pt;
      font-weight: bold;
      color: white;
      text-transform: lowercase;
    }

    .cover-revisions {
      display: flex;
      gap: 2px;
    }

    .cover-revision-box {
      width: 12mm;
      height: 8mm;
      border: 1pt solid #1D1D1B;
      background: white;
      display: inline-block;
    }

    .cover-header-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1pt solid #1D1D1B;
      border-top: none;
      padding: 6px 16px;
    }

    .cover-faculte {
      font-size: 10pt;
      font-weight: bold;
      text-transform: uppercase;
    }

    .cover-annee {
      font-size: 10pt;
      font-weight: bold;
    }

    /* --- Fiche identification row --- */
    .cover-fiche-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      min-height: 54px;
    }

    .cover-matiere {
      font-size: 18pt;
      font-weight: 900;
      flex: 1;
    }

    .cover-fiche-numero {
      width: 54px;
      height: 54px;
      border: 1pt solid #1D1D1B;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      flex-shrink: 0;
    }

    .fiche-label {
      font-size: 8pt;
      text-transform: uppercase;
      font-weight: bold;
      line-height: 1;
    }

    .fiche-number {
      font-size: 18pt;
      font-weight: 900;
      line-height: 1;
      text-transform: uppercase;
    }

    .cover-titre {
      font-size: 18pt;
      flex: 1;
      text-align: right;
    }

    /* --- Plan --- */
    .cover-plan {
      flex: 1;
      margin-bottom: 12px;
      padding: 0 8px;
    }

    .cover-plan ol {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .cover-plan li {
      padding: 6px 0;
      font-size: 11pt;
      display: flex;
      align-items: baseline;
      border-bottom: 0.5pt solid #ddd;
    }

    .cover-plan li:last-child {
      border-bottom: none;
    }

    .plan-num {
      font-weight: 900;
      min-width: 36px;
      display: inline-block;
      font-size: 11pt;
    }

    .plan-text {
      flex: 1;
    }

    /* --- Légende --- */
    .cover-legende {
      border-top: 1pt solid #1D1D1B;
      padding: 8px 0;
    }

    .cover-legende-title {
      font-size: 9pt;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .cover-legende-items {
      display: flex;
      gap: 24px;
    }

    .cover-legende-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 8pt;
      font-style: italic;
      color: #333;
    }

    .legende-icon {
      width: 14px;
      height: 14px;
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
      padding-left: 14px;
      margin: 2px 0;
    }

    /* Level 0 (default): ● solid circle */
    .pdf-topic-content ul > li::before {
      content: "\\25CF  ";
      font-size: 0.6em;
    }

    /* Level 1: ○ open circle + indent */
    .pdf-topic-content ul > li[data-bullet-level="1"] {
      margin-left: 14px;
    }
    .pdf-topic-content ul > li[data-bullet-level="1"]::before {
      content: "\\25CB  ";
      font-size: 0.65em;
    }

    /* Level 2: ■ filled square + more indent */
    .pdf-topic-content ul > li[data-bullet-level="2"] {
      margin-left: 28px;
    }
    .pdf-topic-content ul > li[data-bullet-level="2"]::before {
      content: "\\25A0  ";
      font-size: 0.55em;
    }

    /* Level 3: — dash + most indent */
    .pdf-topic-content ul > li[data-bullet-level="3"] {
      margin-left: 42px;
    }
    .pdf-topic-content ul > li[data-bullet-level="3"]::before {
      content: "\\2014  ";
      font-size: 0.75em;
    }

    .pdf-topic-content ol {
      list-style-type: decimal;
      padding-left: 16px;
      margin: 2px 0;
    }
    .pdf-topic-content ol[data-list-type="upper-roman"] {
      list-style-type: upper-roman;
    }
    .pdf-topic-content ol[data-list-type="upper-alpha"] {
      list-style-type: upper-alpha;
    }
    .pdf-topic-content ol[data-list-type="lower-alpha"] {
      list-style-type: lower-alpha;
    }
    .pdf-topic-content ol[data-list-type="lower-roman"] {
      list-style-type: lower-roman;
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
