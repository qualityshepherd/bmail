const deleteForm = document.getElementById('delete-form')
if (deleteForm) {
  deleteForm.addEventListener('submit', (e) => {
    if (!confirm('Delete this sent message?')) e.preventDefault()
  })
}
