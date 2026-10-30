/* 다이소 안전 · Firebase 설정 (화면에 들어가는 공개용 값 · 진짜 보안은 firestore.rules)
 * 처음 GitHub에 올릴 때만 같이 올리고, 그 뒤로는 바뀔 때만 올립니다. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyA8Zm_PnhBRvtEoSGkEGLhPjnXs053lo0A",
  authDomain: "daiso-safety.firebaseapp.com",
  projectId: "daiso-safety",
  storageBucket: "daiso-safety.firebasestorage.app",
  messagingSenderId: "174882133110",
  appId: "1:174882133110:web:1bd7564451cbb486a6fb57"
};
/* D1.8 사진 중계 (Apps Script 웹 앱 주소 · .../exec 로 끝남)
 * Apps Script 에서 [배포] → [새 배포] 한 뒤 나오는 「웹 앱 URL」을 따옴표 안에 붙여 넣으세요. */
window.RELAY_URL = "";
