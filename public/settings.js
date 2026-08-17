document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('details[open]').forEach(function (d) {
      d.removeAttribute('open')
    })
  }
})
