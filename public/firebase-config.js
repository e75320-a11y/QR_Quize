// Firebase 콘솔에서 발급받은 웹 앱 설정값을 아래에 붙여넣으세요.
// Firebase 콘솔 → 프로젝트 설정 → 내 앱 → SDK 설정 및 구성 에서 확인할 수 있습니다.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
