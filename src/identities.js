// One identity per line: address,name,avatarUrl (name and avatarUrl
// optional). Top line is the compose default. Reuses comma as the field
// separator, same character tags already use. Email addresses can't
// contain a comma in practice (RFC 5321), so the address is always
// everything before the FIRST comma; the avatar URL is taken as
// everything after the LAST comma, so a name containing its own comma
// (e.g. "John Smith, Jr.") doesn't corrupt parsing - naive split(',') with
// positional destructuring silently mis-parsed this case before.
export function parseIdentities (text) {
  return (text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const firstComma = line.indexOf(',')
      if (firstComma === -1) {
        return { address: line.trim(), name: '', avatarUrl: '' }
      }

      const address = line.slice(0, firstComma).trim()
      const rest = line.slice(firstComma + 1)
      const lastComma = rest.lastIndexOf(',')

      if (lastComma === -1) {
        return { address, name: rest.trim(), avatarUrl: '' }
      }

      return {
        address,
        name: rest.slice(0, lastComma).trim(),
        avatarUrl: rest.slice(lastComma + 1).trim()
      }
    })
    .filter((identity) => identity.address)
}

export function formatIdentities (identities) {
  return identities
    .map((i) => {
      const fields = [i.address, i.name || '', i.avatarUrl || '']
      while (fields.length > 1 && fields[fields.length - 1] === '') fields.pop()
      return fields.join(',')
    })
    .join('\n')
}

export function getDefaultIdentity (identities) {
  return identities.length > 0 ? identities[0] : null
}

// Case-insensitive - email addresses aren't case-sensitive in practice.
export function findIdentityByAddress (identities, address) {
  const target = (address || '').toLowerCase()
  return identities.find((i) => i.address.toLowerCase() === target) || null
}
