# Setting up Parlei

About an hour, most of it waiting for pages to load. You'll set up four free accounts' worth of settings, paste them into two places, and deploy.

| Service | What it does for Parlei | Cost for one class |
|---|---|---|
| **Firebase** | Logins, database, audio storage, push notifications | Free allowance covers it. Audio storage needs the pay-as-you-go (Blaze) plan, which still has a free allowance. |
| **Vercel** | Hosts the website, sends notifications, runs the daily reminders | Free (Hobby) |
| **Resend** | Sends the emails | Free up to 3,000 emails a month (100 a day) |
| **Anthropic API** (optional) | The vocabulary **Look up** button | Fractions of a cent per look-up |

Use the same teacher email everywhere below. In these steps it's written as **YOUR_EMAIL**.

---

## 1. Firebase project

1. Go to **console.firebase.google.com** → **Create a project** → name it `parlei`. Google Analytics is optional.
2. **Add a web app:** on the project home, click the **`</>`** (Web) icon, name it `Parlei`, and click **Register app**. Leave "Firebase Hosting" unticked. Copy the `firebaseConfig` values it shows.
3. Open **`public/config.js`** in this repository and paste those values into `firebase`. Set `ownerEmail` to **YOUR_EMAIL**.

### Sign-in
4. **Build → Authentication → Get started.**
5. Under **Sign-in method**, turn on **Email/Password** and **Google**.
6. Under **Settings → Authorized domains**, add your website's domain once you have it (for example `parlei.ca` and `parlei.vercel.app`).

### Database
7. **Build → Firestore Database → Create database.** Pick a location close to your students (for Toronto, `northamerica-northeast2`). Start in **production mode**.
8. Open the **Rules** tab. Paste in the contents of **`firestore.rules`**, replace `replace_with_your_email` with **YOUR_EMAIL** in lower case, and click **Publish**.

### Audio storage
9. **Build → Storage → Get started.** If asked, upgrade to the **Blaze** plan. Set a budget alert (for example $5) under **Usage and billing** so nothing surprises you.
10. Open the **Rules** tab. Paste in **`storage.rules`**, replace `replace_with_your_email` with **YOUR_EMAIL**, and click **Publish**. If Firebase asks to let Storage read Firestore, say yes.

### Push notifications
11. **Project settings (gear icon) → Cloud Messaging → Web configuration → Web Push certificates → Generate key pair.** Copy the key into `vapidKey` in **`public/config.js`**.

### Server key (for Vercel)
12. **Project settings → Service accounts → Generate new private key.** A `.json` file downloads. Keep it private: never commit it to GitHub. You'll paste its contents into Vercel in step 4.

## 2. Resend (emails)

1. Sign up at **resend.com**.
2. **Domains → Add domain:** add the domain you'll send from, for example `parlei.ca`. Add the DNS records it lists in **Cloudflare**, the same way you set up getbild's DNS. Wait for it to show **Verified**.
3. **API Keys → Create API key.** Copy it.

Until your domain is verified, Resend only delivers to your own email address. That's fine for testing.

## 3. Anthropic API (optional, for Look up)

1. Go to **console.anthropic.com** → **API Keys** → **Create key**. Add a little credit under **Billing**.
2. Skip this step and Look up simply stays hidden. Or set `lookup: false` in `public/config.js`.

## 4. Vercel

1. **vercel.com → Add New → Project → Import** the `Parlei` GitHub repository.
2. **Framework preset:** Other. Leave the build command empty. The output directory is set in `vercel.json`.
3. Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole contents of the `.json` file from step 1.12 |
| `OWNER_EMAIL` | **YOUR_EMAIL** |
| `APP_URL` | Your site's address, e.g. `https://parlei.ca` |
| `RESEND_API_KEY` | The key from Resend |
| `FROM_EMAIL` | `Parlei <hello@parlei.ca>`, using an address on your verified domain |
| `CRON_SECRET` | Any long random text. It protects the daily reminders. |
| `ANTHROPIC_API_KEY` | Optional. The key from step 3. |
| `APP_TIMEZONE` | Optional. Defaults to `America/Toronto`. |
| `LOOKUP_DAILY_LIMIT` | Optional. Look-ups per person per day; default 150. |

4. Click **Deploy**.
5. **Domain:** under **Settings → Domains**, add `parlei.ca` (or your choice) and follow the DNS steps in Cloudflare. Then add the domain to Firebase's **Authorized domains** (step 1.6), and update `APP_URL`.

## 5. First sign-in

1. Open your site and **Continue with Google** using **YOUR_EMAIL**. Or create a password account with it and click the confirmation link in your inbox: the teacher email must be confirmed.
2. You'll land on **Set up your first class**. Create one, or click **Start with a sample French A1 class**.
3. Open **Settings**, tap **Send me a test**, and check that the email arrives. Tap **Turn on for this device** to test push.

## 6. Students

Send students your site's address and the class **join code**. They tap **New student? Create an account**, confirm their email, and enter the code.

**Push on iPhone and iPad:** Apple only allows notifications for sites saved to the home screen. Students open Parlei in Safari, tap **Share → Add to Home Screen**, open it from the new icon, then turn on push under **Settings**. Android phones and computers can turn it on straight from the browser.

## Notifications at a glance

| Who | When | Settings key |
|---|---|---|
| Students | You post an announcement, assignment, lesson or recording | announcement, assignment, lesson |
| Students | You grade their work (written tasks; quizzes show their score right away) | grade |
| Students and you | A new message | message |
| Students | The day before an assignment is due, if they haven't handed in | due |
| Students and you | The day before a class session or a booked 1:1 | session |
| You | A student hands in work, joins a class or books a 1:1 | submission, joined, booking |

Everyone can turn each one on or off, separately for email and push, under **Settings**. Reminders go out once a day at 7 a.m. Toronto time (12:00 UTC; change it in `vercel.json`).

## Adding another teacher later

In Firestore, create a document in a collection named `teachers` whose ID is that person's user ID (from **Authentication → Users**). They get teacher access on their next sign-in.

## Making changes

- Edit **`src/app.html`**, then run `python3 src/build.py` to rebuild `public/index.html`. Commit both.
- Server code is in **`api/`**. Run its tests with `npm install` and then `npm test`.
- Opened without Firebase settings, for example from your computer with `npm run dev`, Parlei runs as a demo with sample data that isn't saved.
