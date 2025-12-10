// Your Firebase Configuration
const firebaseConfig = {
  "auth": {
    "uid": "1f949b0b-1d31-44e9-ae10-d03369147f3d",
    "token": {
      "sub": "1f949b0b-1d31-44e9-ae10-d03369147f3d",
      "firebase": {
        "sign_in_provider": "google.com"
      },
      "email": "Mdlaures@gmail.com",
      "email_verified": true,
      "phone_number": "+233593416186",
      "name": "Yaro"
    }
  },
  "resource": {
    "key": "value"
  },
  "path": "/phonelockcontroller",
  "method": "set",
  "time": "2025-12-10T13:27:16.353Z",
  "isAdmin": false
};

// Initialize Firebase
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// Firebase Services
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();

// Authentication State Listener
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log("User signed in:", user.uid);
    if (typeof onAuthStateChanged === 'function') {
      onAuthStateChanged(user);
    }
  } else {
    console.log("No user signed in");
    // Sign in anonymously
    auth.signInAnonymously()
      .catch(error => console.error("Auth error:", error));
  }
});

// Export services
window.firebaseAuth = auth;
window.firebaseDatabase = database;
window.firebaseStorage = storage;
