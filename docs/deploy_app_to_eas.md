# Expo EAS Hosting – Quick Command Guide

## 1. Install EAS CLI

```bash
npm install --global eas-cli
```

(or use `npx eas-cli@latest`)

## 2. Log in to Expo

```bash
eas login
```

Check login:

```bash
eas whoami
```

## 3. Export your web project

```bash
npx expo export --platform web
```

(Run this every time before deploying.)

## 4. Deploy to EAS Hosting

```bash
eas deploy
```

- **First time**: connect project and pick preview subdomain.
- **After deployment**: you'll get a preview URL and a production URL.

---

## ✅ Workflow Summary

**Install CLI → Login → Export → Deploy**