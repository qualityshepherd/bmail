// No handler here - /export/mbox and /backup/run are already their own
// routes (export-handler.js, backup-handler.js). This is just the tab's markup.
export function renderExportTab () {
  return `<section class="settings-section">
    <p class="settings-hint">Download all received and sent mail as a single .mbox file.
       Importable into Thunderbird, Apple Mail, and most email clients.</p>
    <a href="/export/mbox" class="btn-outline">Download .mbox</a>
    <h3>Database backup</h3>
    <p class="settings-hint">Saves a SQL dump to R2 (<code>backups/bmail-YYYY-MM-DD.sql</code>).
       Runs automatically at 00:42 MDT. Run manually before migrations or anything risky.</p>
    <form method="post" action="/backup/run">
      <button type="submit" class="btn-outline">Back up now</button>
    </form>
  </section>`
}
