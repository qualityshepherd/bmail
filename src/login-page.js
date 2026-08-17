export function renderLoginPage () {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Log in - Bmail</title>
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/login.css">
</head>
<body>
  <main class="login">
    <h1>Bmail</h1>
    <form id="login-form">
      <label for="passphrase">passphrase</label>
      <div class="passphrase-wrap">
        <input id="passphrase" type="password" autocomplete="current-password" autofocus>
        <button type="button" id="toggle-passphrase" aria-label="Show passphrase" title="Show passphrase">
          <svg id="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>
      <button id="login-btn" type="submit">Log in</button>
      <span id="status" class="status"></span>
    </form>
  </main>
  <script src="/login.js"></script>
</body>
</html>`
}
