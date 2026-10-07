/**
 * Download tabular data as a CSV file.
 *
 * Uses the data URI approach for broad browser compatibility.
 * String values containing commas or quotes are NOT auto-escaped —
 * callers should pre-format rows (e.g., wrap in quotes, escape inner quotes).
 *
 * @param header  - CSV header row (comma-separated column names)
 * @param rows    - Array of pre-formatted CSV row strings
 * @param filename - Download filename (should end with .csv)
 */
export function downloadCSV(
  header: string,
  rows: string[],
  filename: string,
): void {
  const csvContent = [header, ...rows].join("\r\n");
  const encodedUri =
    "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
