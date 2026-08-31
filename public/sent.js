const deleteForm = document.getElementById('delete-form')
if (deleteForm) {
  deleteForm.addEventListener('submit', (e) => {
    if (!confirm('Delete this sent message?')) e.preventDefault()
  })
}

// Close any open <details> on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'))
  }
})
