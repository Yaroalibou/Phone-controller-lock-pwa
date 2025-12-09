// Your Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "phone-lock-controller.firebaseapp.com",
  databaseURL: "https://phone-lock-controller-default-rtdb.firebaseio.com",
  projectId: "phone-lock-controller",
  storageBucket: "phone-lock-controller.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123def456"
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
