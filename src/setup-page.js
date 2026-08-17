export function renderSetupPage () {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Bmail Setup</title>
<link rel="stylesheet" href="/setup.css">
</head>
<body>
  <h1>Bmail Setup</h1>
  <p class="warn">
    <strong>Your key never leaves this browser, and nothing is saved anywhere.</strong><br>
    Pick a sentence only you would think of. The weirder and longer, the better - your
    favorite obscure movie quote is perfect. "Password" is not. You'll type this same
    passphrase again every time you log in, so remember it (a password manager is fine).
  </p>

  <label for="passphrase">your passphrase</label>
  <input id="passphrase" type="text" placeholder="yeah well that's just like your opinion man" autocomplete="off" spellcheck="false">

  <button id="generate">Generate keypair</button>

  <div id="output">
    <h2>Add the public key to wrangler.toml</h2>
    <p>Paste this into the <code>[vars]</code> section, then redeploy:</p>
    <pre id="varsBlock"></pre>
    <p><small>This key is derived from your passphrase AND this exact domain
       (<code id="hostname"></code>) - the same passphrase on a different domain produces a
       different key, on purpose. If you move Bmail to a new domain later, you'll generate
       a new key here.</small></p>
    <p><small>Adding a second device? Just log in with the same passphrase there too - there's
       nothing device-specific to copy.</small></p>

    <h2>Redeploy</h2>
    <pre>npm run deploy</pre>
    <p>Once redeployed, refresh this page - it'll show the login form instead of this setup form.</p>
  </div>
  <script src="/setup.js"></script>
</body>
</html>`
}
