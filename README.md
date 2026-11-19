# Parlei

*Parlei* blends the Portuguese *falei* and the French *parlé*: "I spoke."

A language learning portal for teachers and students: classes, lessons, assignments, flashcards, vocabulary, audio, media, scheduling and messages, with email and push notifications.

**To get it running, follow [SETUP.md](SETUP.md).**

## Features

- **Accounts:** students create an account (email and password, or Google), confirm their email, and join a class with a six-character code. The teacher sees everyone enrolled on the **Students** page.
- **Lessons:** plain-text lessons where lines like `bonjour = hello` become vocabulary rows with a listen button.
- **Assignments:** written tasks graded with feedback, and quizzes that grade themselves.
- **Flashcards:** spaced-repetition decks, with each student's progress visible to the teacher.
- **Vocabulary:** each student's own word bank, one tab per language, with look-up and dictionary links.
- **Media:** class audio recordings uploaded by the teacher, and each student's personal repertoire of songs, shows, podcasts and books, with teacher recommendations.
- **Schedule:** class sessions and bookable 1:1 office-hour slots.
- **Messages:** a private thread between each student and the teacher, plus class announcements.
- **Notifications:** email and push for announcements, new work, grades, messages, due-date and class reminders, and, for the teacher, hand-ins, new students and bookings. Everyone chooses what they get under **Settings**.
- **Installable:** add Parlei to a phone's home screen; it opens like an app and can receive push notifications.

## How it's built

| Part | Technology |
|---|---|
| Web app | One HTML page (`public/index.html`, built from `src/app.html`), plain JavaScript, no framework |
| Connection to Firebase | `public/platform.js`, using the Firebase web SDK 12.19.0 bundled in `public/vendor/` |
| Logins | Firebase Authentication (email/password, Google) |
| Data | Cloud Firestore, protected by `firestore.rules` |
| Audio files | Cloud Storage for Firebase, protected by `storage.rules` |
| Push notifications | Firebase Cloud Messaging and a service worker (`public/firebase-messaging-sw.js`) |
| Server | Vercel serverless functions in `api/`: `notify` (email and push for each event), `cron-daily` (reminders), `lookup` (vocabulary look-up through the Anthropic API) |
| Email | Resend |

### Privacy and permissions

- Course content (classes, lessons, assignments, decks, schedule, recordings) is readable by signed-in users and editable only by teachers.
- Each student's profile, submissions, flashcard progress, word bank, repertoire and messages are readable only by that student and the teacher.
- Grades and feedback are written only by the teacher.
- Notifications are sent by the server only after it checks the event against the database, and each event is sent once.

### Data model

Course content: `classes`, `lessons`, `assignments`, `decks`, `events`, `announcements`, `audio`, `recs`.
One document per person: `members` (classes joined), `profiles` (details and notification settings), `subs` (submissions), `grades`, `prog` (flashcards), `threads` (messages), `bookings`, `vocab`, `media`, `pushTokens`.
Teachers: `teachers/{uid}` (plus the owner email set in config).

## Repository layout

```
public/            the website Vercel serves
  index.html       built app (do not edit; edit src/app.html)
  platform.js      Firebase connection layer
  config.js        your Firebase settings (see SETUP.md)
  firebase-messaging-sw.js, manifest.webmanifest, icons/, vendor/
src/               app source and build script
api/               server functions (notifications, reminders, look-up)
tests/             server tests (npm test)
firestore.rules, storage.rules, firebase.json
claude-version/    the original version that runs as a Claude artifact
```

## Development

```sh
python3 src/build.py     # rebuild public/index.html after editing src/app.html
npm install && npm test  # server tests
npm run dev              # serve public/ on http://localhost:3000 (demo mode until config.js is filled in)
```
