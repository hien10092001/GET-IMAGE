const KO_APP_RE = /KO APP:\(.*\)/g

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const highlightKoApp = (value) => escapeHtml(value).replace(
  KO_APP_RE,
  match => `<span style="color:#ff0000;font-weight:bold">${match}</span>`
)

export async function copyTable(rows, header = null) {
  const textRows = header ? [header, ...rows] : rows
  const text = textRows.map(row => row.join('\t')).join('\n')

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const thead = header
        ? `<thead><tr>${header.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
        : ''
      const tbody = `<tbody>${rows
        .map(row => `<tr>${row.map(cell => `<td>${highlightKoApp(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
      const html = `<table>${thead}${tbody}</table>`
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
      return
    }
    await navigator.clipboard.writeText(text)
  } catch {
    await navigator.clipboard.writeText(text)
  }
}
