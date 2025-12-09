# Phone-controller-lock-pwa

# Phone Lock Controller PWA

A Progressive Web App that allows you to remotely lock/unlock another phone using Firebase.

## Features

- **Remote Lock/Unlock**: Instantly lock/unlock another phone
- **PWA Installation**: Client can be installed as a native app
- **QR Code Connection**: Easy connection via QR code scanning
- **Real-time Updates**: Firebase Realtime Database for instant commands
- **Offline Support**: Service Worker for offline functionality
- **Cross-platform**: Works on Android, iOS, and desktop browsers
- **Secure**: Anonymous Firebase authentication
- **Installable**: Add to home screen for app-like experience

## Setup Instructions

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project: `Phone Lock Controller`
3. Enable **Realtime Database**
4. Enable **Anonymous Authentication**
5. Get your Firebase config and update `firebase-config.js`

### 2. Database Rules

Set these rules in Firebase Realtime Database:

```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        ".read": true,
        ".write": true,
        ".validate": "newData.hasChildren(['created', 'status'])"
      }
    }
  }
}

# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init hosting
# Select your project
# Set public directory as "."
# Configure as single-page app: No
# Overwrite index.html: No

# Deploy
firebase deploy --only hosting
