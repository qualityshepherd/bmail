export function renderLoginPage () {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Log in - Bmail</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/bmail_36px.png" type="image/png" sizes="36x36">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_180px.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/login.css">
</head>
<body>
  <main class="login">
    <img src="/bmail_logo2.png" alt="" class="login-logo">
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
      <div class="phrase-strength"><div class="strength-bar" id="strength-bar"></div></div>
      <div class="strength-flavor" id="strength-flavor"></div>
      <button id="login-btn" type="submit">Log in</button>
      <span id="status" class="status"></span>
    </form>
  </main>
  <script src="/login.js"></script>
<script src="/sw-register.js" defer></script>
</body>
</html>`
}
