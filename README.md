# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Deploying to EAS Hosting

You can deploy your Expo Web project using **EAS Hosting**.

1. **Export the web build**

   ```bash
   npx expo export --platform web
   ```

   This generates a static web build inside the `dist/` directory.

2. **Deploy to EAS Hosting**

   ```bash
   eas deploy
   ```

   - This creates a **preview deployment** and gives you a preview URL like:  
     ```
     https://your-app--1234.expo.app/
     ```

3. **Production Deployment**

   To create a production deployment, run:

   ```bash
   eas deploy --prod
   ```

   This will give you a stable **production URL** for your web app.

### Notes

- You must be logged in with your Expo account before deploying:

  ```bash
  npx expo login
  ```

- You can customize deployments with options like `--alias` or `--export-dir`.  
- Learn more: [EAS Hosting docs](https://docs.expo.dev/eas/hosting/get-started/)

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
