import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
