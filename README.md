# Parlei

*Parlei* blends the Portuguese *falei* and the French *parlé*: "I spoke."

A language learning portal for teachers and students: classes, lessons, assignments, flashcards, vocabulary, audio, media, scheduling and messages, with email and push notifications.

**To get it running, follow [SETUP.md](SETUP.md).**

## Features

- **Accounts:** separate sign-ups for students and instructors (email and password, or Google). Students join a class with a six-character code; instructor accounts are approved by the owner. The teacher sees everyone enrolled on the **Students** page.
- **Lessons:** plain-text lessons where lines like `bonjour = hello` become vocabulary rows with a listen button. For other scripts: `مرحبا | marhaba = hello`.
- **Assignments:** written tasks graded with feedback, and quizzes that grade themselves.
- **Flashcards:** spaced-repetition decks, with each student's progress visible to the teacher.
- **Word Bank:** each student's own word bank, one tab per language, with look-up and dictionary links. Languages with their own script (Arabic, Japanese, Korean, Mandarin) take both forms, e.g. مرحبا and marhaba or Franco-Arabic like 7abibi, and search finds either.
- **Notebook:** private notes for students and instructors, with formatting (headings, lists, checklists, quotes, links), autosave, folders, pinning, search, sorting, trash and restore, duplicate, copy, download, read aloud, and sending a selected word to the Word Bank. Works without a class.
- **Media:** class audio recordings uploaded by the teacher, and each student's personal repertoire of songs, shows, podcasts and books, with teacher recommendations.
- **Schedule:** class sessions and bookable 1:1 office-hour slots.
- **Messages:** private conversations between a student and the teachers they choose (or a teacher and a student, optionally with co-teachers). Only the people listed can see them. Plus class announcements.
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
| Server | Vercel serverless functions in `api/`: `notify` (email and push for each event), `access` (class access and co-teachers), `cron-daily` (reminders), `lookup` (vocabulary look-up through the Anthropic API) |
| Email | Resend |

### Privacy and permissions

- The owner (administrator) approves instructors and can see everything.
- Each class has one owning instructor, plus co-teachers that only the class owner (or the administrator) can add. Instructors see only their own classes and those classes' students.
- Course content is readable by signed-in users and editable only by the teachers of its class.
- Submissions, grades and flashcard progress are stored per student per class (`{student}__{class}`), so only the student and the teachers of that class can read them, even when a student is shared between instructors. Grades are written only by the class's teachers. A student's profile is readable by any of their teachers. Word banks and media lists are private to the student.
- Messages are visible only to the people listed in each conversation (the owner included). Everyone listed must be the student or one of their teachers, and the list can't change once the conversation starts.
- Access lists (`members/{uid}.teacherIds`) and co-teacher changes are maintained only by the server (`/api/access`), so no one can grant themselves access.
- Notifications are sent by the server only after it checks the event against the database, and each event is sent once.

### Data model

Conversations: `convos` (`student`, `participants`, messages).
Course content: `classes`, `lessons`, `assignments`, `decks`, `events`, `announcements`, `audio`, `recs`.
One document per person: `members` (classes joined), `profiles` (details and notification settings), `bookings`, `vocab`, `media`, `pushTokens`.
Notebook pages live in `notes/{uid}/items/{noteId}`, readable and writable only by that person (not teachers, not the owner).

One document per person per class (`{uid}__{classId}`): `subs` (submissions), `grades`, `prog` (flashcards; personal Word Bank practice uses `{uid}__self`).
Teachers: `teachers/{uid}` (plus the owner email set in config); instructor sign-ups wait in `instructorRequests/{uid}`.

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

In demo mode the sign-up and sign-in forms work exactly as on the live site, but accounts last only for the visit. Quick logins: `teacher@demo.parlei` and `student@demo.parlei` with any password.
