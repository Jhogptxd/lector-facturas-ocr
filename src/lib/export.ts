import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/** jspdf-autotable stamps this on the document after each call; not in the jsPDF types. */
type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

export function exportRowsToExcel(rows: Record<string, unknown>[], filename: string, sheetName = "Datos") {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportRowsToPdf(title: string, rows: Record<string, unknown>[], filename: string) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);

  if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    autoTable(doc, {
      startY: 22,
      head: [columns],
      body: rows.map((row) => columns.map((col) => String(row[col] ?? ""))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 122, 61] },
    });
  } else {
    doc.setFontSize(10);
    doc.text("Sin datos para el período seleccionado.", 14, 26);
  }

  doc.save(`${filename}.pdf`);
}

type FinancialSection = { title: string; rows: Record<string, unknown>[] };

/**
 * Combined Ventas/Gastos/Deudas workbook, one sheet per section. Sheets stay
 * separate (rather than stacked in one table) so each keeps its own columns
 * and opens straight into a usable table in Excel/Sheets.
 */
export function exportFinancialExcel(sections: FinancialSection[], filename: string) {
  const workbook = XLSX.utils.book_new();
  for (const section of sections) {
    const sheet =
      section.rows.length > 0
        ? XLSX.utils.json_to_sheet(section.rows)
        : XLSX.utils.aoa_to_sheet([["Sin datos para el período seleccionado."]]);
    // Sheet names are capped at 31 chars by the xlsx format.
    XLSX.utils.book_append_sheet(workbook, sheet, section.title.slice(0, 31));
  }
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Single PDF with a business header, generation timestamp, a summary table,
 * and one table per section (Ventas/Gastos/Deudas), each continuing below the
 * previous one and spilling onto new pages automatically via autoTable.
 */
export function exportFinancialPdf(params: {
  businessName: string;
  rangeLabel: string;
  summary: { label: string; value: string }[];
  sections: FinancialSection[];
  filename: string;
}) {
  const doc = new jsPDF() as JsPDFWithAutoTable;
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${params.businessName.toUpperCase()} - Reporte Financiero`, marginLeft, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const generatedAt = new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
  doc.text(`Generado el ${generatedAt}`, marginLeft, 25);
  doc.text(`Período: ${params.rangeLabel}`, marginLeft, 30);

  autoTable(doc, {
    startY: 36,
    head: [["Resumen", "Valor"]],
    body: params.summary.map((s) => [s.label, s.value]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 122, 61] },
    theme: "grid",
    margin: { left: marginLeft, right: marginLeft },
  });
  let cursorY = doc.lastAutoTable.finalY + 10;

  for (const section of params.sections) {
    if (cursorY > pageHeight - 30) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(section.title, marginLeft, cursorY);
    cursorY += 4;

    if (section.rows.length > 0) {
      const columns = Object.keys(section.rows[0]);
      autoTable(doc, {
        startY: cursorY,
        head: [columns],
        body: section.rows.map((row) => columns.map((col) => String(row[col] ?? ""))),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 122, 61] },
        margin: { left: marginLeft, right: marginLeft },
      });
      cursorY = doc.lastAutoTable.finalY + 10;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Sin datos para el período seleccionado.", marginLeft, cursorY + 4);
      cursorY += 14;
    }
  }

  doc.save(`${params.filename}.pdf`);
}
