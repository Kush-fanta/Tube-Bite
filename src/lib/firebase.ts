import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyAMzCNRgEjSwbDK_xxsHN03y7b_97n6XD0",
    authDomain: "tube-bite.firebaseapp.com",
    projectId: "tube-bite",
    storageBucket: "tube-bite.firebasestorage.app",
    messagingSenderId: "664747943596",
    appId: "1:664747943596:web:a2f9ed31f6f2a274ef2109",
    measurementId: "G-9H7JCCXCB3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
