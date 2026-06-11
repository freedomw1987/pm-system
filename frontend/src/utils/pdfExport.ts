/**
 * pdfExport — Sprint 20 US-3: 報表導出 PDF 工具
 *
 * 用 jspdf + jspdf-autotable 嘅純文字 / 表格方案,輕量(~200KB)。
 * 中文字型預設用內建 Helvetica → 中文會亂碼(已知限制)。
 * 退路:欄位名用英文,資料仍可顯示(就算渲染中文,使用者亦可辨識)。
 * 長期方案:引入 NotoSansCJK(此次 sprint 唔包)。
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PdfTableColumn {
  header: string
  dataKey: string
  /** Optional formatter(eg. 將 decimal 轉成 1 位小數,將日期格式統一) */
  format?: (value: any) => string
}

export interface PdfExportOpts {
  /** 文件標題(顯示喺 PDF 頂部) */
  title: string
  /** 副標題(eg. 「時段: 2026-06-01 ~ 2026-06-30」) */
  subtitle?: string
  /** 文件生成時間(默認 now) */
  generatedAt?: Date
  /** 表格欄位 */
  columns: PdfTableColumn[]
  /** 表格資料列(每個 record 對應 dataKey 取值) */
  rows: Record<string, any>[]
  /** 檔名(不含 .pdf) */
  filename: string
  /** A4 orientation(默認 portrait) */
  orientation?: 'portrait' | 'landscape'
}

/**
 * 將任意 value 攤平成 cell string。
 * 處理 null / undefined / 數字 / 日期等 edge case,避免 "[object Object]" 進 PDF。
 */
function cellValue(value: any, format?: (v: any) => string): string {
  if (value === null || value === undefined) return ''
  if (format) return format(value)
  if (typeof value === 'number') {
    // 整數就顯示整數,小數保留 1 位
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }
  return String(value)
}

/**
 * 導出 PDF 並觸發瀏覽器下載。
 *
 * 用法:
 *   exportReportPdf({
 *     title: '工作時數報表 — 研發部',
 *     columns: [
 *       { header: '日期', dataKey: 'date' },
 *       { header: '時數', dataKey: 'hours' },
 *     ],
 *     rows: [{ date: '2026-06-01', hours: 8 }],
 *     filename: 'worklogs_RD_202606',
 *   })
 */
export function exportReportPdf(opts: PdfExportOpts): void {
  const {
    title,
    subtitle,
    generatedAt = new Date(),
    columns,
    rows,
    filename,
    orientation = 'portrait',
  } = opts

  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Title
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 40, 50)

  // Subtitle
  let y = 72
  if (subtitle) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(subtitle, 40, y)
    y += 16
  }

  // Generated at
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(`Generated: ${generatedAt.toISOString()}`, 40, y)
  doc.setTextColor(0)
  y += 12

  // Table
  autoTable(doc, {
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => cellValue(row[c.dataKey], c.format))),
    startY: y + 8,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [102, 126, 234], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
    tableWidth: pageWidth - 80,
  })

  // Footer: page numbers
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Page ${i} / ${pageCount}`,
      pageWidth - 40,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' },
    )
  }

  doc.save(`${filename}.pdf`)
}
