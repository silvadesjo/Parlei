# Parlei

*Parlei* blends the Portuguese *falei* and the French *parlé*: "I spoke."

A language learning portal for teachers and students, built as a single HTML page.

## Features

- **Classes:** students join with a six-character code; one teacher can run several classes.
- **Lessons:** plain-text lessons where lines like `bonjour = hello` become vocabulary rows with a listen button.
- **Assignments:** written tasks graded with feedback, and quizzes that grade themselves.
- **Flashcards:** spaced-repetition decks (Leitner boxes), with per-student progress for the teacher.
- **Vocabulary:** each student's own word bank, one tab per language, with look-up and dictionary links.
- **Media:** class audio recordings uploaded by the teacher (M4A as is; MP3/WAV converted in the browser to Opus/WebM), and a personal repertoire of songs, shows, podcasts and books, with teacher recommendations.
- **Schedule:** class sessions and bookable 1:1 office-hour slots.
- **Messages:** a private thread between each student and the teacher, plus class announcements.

## How it runs

`index.html` is published as a Claude artifact. It uses the artifact platform's capabilities through `window.claude.use(...)`:

| Capability | Used for |
|---|---|
| `db` | All shared and per-student data (classes, lessons, submissions, progress, messages, word banks) |
| `user` | Who is viewing, teacher vs. student, display names |
| `assets` | Storing uploaded audio recordings |
| `tts` | Reading French words aloud |
| `sample` | Vocabulary look-up |

Opened anywhere else (for example, straight from disk), the page runs in **demo mode** with sample data held in memory. Nothing is saved in demo mode.

The access rules declared with the artifact keep each student's submissions, flashcard progress, messages, word bank and repertoire private to that student, and let only the teacher (owner/editors) change course content.

## Editing

The source lives in `src/`:

- `template.html` — the app (HTML, CSS and JavaScript in one file)
- `seed.json` — the sample French A1 class
- `build.py` — inserts the seed and demo data into the template and writes `index.html`

```sh
python3 src/build.py
```

## Moving off the artifact platform

To run Parlei as a standalone product, replace the `claude.use(...)` calls with a real backend (authentication, a database, file storage). The data model in `template.html` maps directly onto collections: `classes`, `lessons`, `assignments`, `decks`, `events`, `announcements`, `audio`, `recs`, plus per-person documents under `members`, `subs`, `prog`, `threads`, `bookings`, `vocab` and `media`.
