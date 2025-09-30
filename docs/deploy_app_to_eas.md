Got it — here’s the summary in raw markdown:

# Expo EAS Hosting – Quick Command Guide

## 1. Install EAS CLI
```bash
npm install --global eas-cli

(or use npx eas-cli@latest)

2. Log in to Expo

eas login

Check login:

eas whoami

3. Export your web project

npx expo export --platform web

(Run this every time before deploying.)

4. Deploy to EAS Hosting

eas deploy

	•	First time: connect project and pick preview subdomain.
	•	After deployment, you’ll get a preview URL and a production URL.

⸻

✅ Workflow: Install CLI → Login → Export → Deploy

