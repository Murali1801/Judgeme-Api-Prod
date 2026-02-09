# Judge.me API Wrapper - Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI**: Install with `npm i -g vercel`
3. **Firebase Service Account**: You already have this file

## Setup Instructions

### 1. Install Vercel CLI (if not installed)
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Add Environment Variables to Vercel

You need to add these secrets to your Vercel project via the Dashboard (Settings > Environment Variables) or CLI:

```bash
# Judge.me API Credentials
vercel env add JUDGE_ME_API_TOKEN
vercel env add SHOP_DOMAIN

# Cloudinary Credentials
vercel env add CLOUDINARY_CLOUD_NAME
vercel env add CLOUDINARY_API_KEY
vercel env add CLOUDINARY_API_SECRET

# Firebase
vercel env add FIREBASE_PROJECT_ID

# JWT Secret
vercel env add JWT_SECRET

# Firebase Service Account (The most important one)
# Open your .json file, copy the ENTIRE content, and paste it here
vercel env add FIREBASE_SERVICE_ACCOUNT
```

### 4. Deploy
```bash
vercel --prod
```

## Firestore Security Rules

Since your backend uses the **Firebase Admin SDK**, it bypasses security rules. However, for best practices and to prevent accidental public access, you should apply these rules in your Firebase Console (Build > Firestore Database > Rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Lock down everything by default
    // The Admin SDK (your server) will still have full access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Important Notes

- **Never commit** `.env` or Firebase service account JSON files to Git
- The `.gitignore` file is configured to protect sensitive files
- All environment variables should be set in Vercel dashboard or CLI
- Firebase credentials are stored in Firestore, NOT in code

## Local Development

1. Run `npm install`
2. Ensure `.env` file has all required variables
3. Run `node server.js`
4. Access at `http://localhost:5000`

## Production URLs (after deployment)

- **Login**: `https://your-app.vercel.app/`
- **Admin Dashboard**: `https://your-app.vercel.app/public/admin.html`
- **API**: `https://your-app.vercel.app/api/*`
