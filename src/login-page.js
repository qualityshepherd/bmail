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
      <input id="passphrase" type="password" autocomplete="current-password" autofocus>
      <button id="login-btn" type="submit">Log in</button>
      <span id="status" class="status"></span>
    </form>
  </main>
  <script src="/login.js"></script>
</body>
</html>`
}
