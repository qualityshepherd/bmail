import { learnContacts, fillContactAvatar } from './db-contacts.js'
import { peopleFromSend } from './contacts.js'
import { findTouchIcon, storeAvatar } from './avatars.js'

// After a send, under waitUntil: you wrote to them, so they're a contact.
// Brand-new ones get one shot at a touch icon; a miss means initials.
export async function learnFromSend (env, send) {
  const people = peopleFromSend(send)
  const added = await learnContacts(env.DB, people)
  for (const email of added) {
    for (const url of await findTouchIcon(email.split('@')[1])) {
      if (await storeAvatar(env, url)) {
        await fillContactAvatar(env.DB, email, url)
        break
      }
    }
  }
  return added
}
