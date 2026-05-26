# Simple ToDo 

Project Link: https://simpletodo.muhtasimmahim.me/

It is a simple to do app coded with HTML, CSS and Javascript. Simple ToDo is a client-side, AI-powered NoticeBoard PWA.
Users paste raw university notices, parse them with Groq, review extracted fields, and save clean todo cards locally.

## Stack

- HTML
- CSS
- Vanilla JavaScript
- LocalStorage
- Groq API (user-provided key)
- Service Worker + Web App Manifest

No backend, no framework, no build step, no npm required.

## Project Structure

```
/index.html
/styles.css
/app.js
/sw.js
/manifest.json
/assets/
  icon-192.svg
  icon-512.svg
```

## Features

- AI notice parser with editable preview before save
- Todo views: All, Upcoming, Done
- Task actions: add, edit, complete, delete
- Local persistence with LocalStorage
- Settings:
  - Save Groq API key locally
  - Theme mode: Light / Dark / System
  - Export tasks as JSON
  - Import tasks from JSON
  - Clear all tasks
- Live date/time header on Todo page (device timezone, updates every second)
- Mobile-first UI with bottom nav, transitions, toasts, empty state
- Offline-ready app shell via service worker caching
- Installable PWA

## Groq API Setup

1. Create a Groq API key from the Groq console.
2. Open the app, go to **Settings**, paste key, click **Save key**.
3. Key stays only in your browser localStorage for this device/profile.

## Notes

- Offline mode supports saved tasks and the cached app shell.
- Groq parsing needs network access.
- API key is never embedded in source code and is never sent anywhere except Groq from the user browser.
