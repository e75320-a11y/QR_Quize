# 온라인 QR 퀴즈 서바이벌 (Firebase 버전)

Node.js 없이 **Firebase**로 배포해서 사용하는 버전입니다.
실시간 동기화는 Firebase Realtime Database를 사용하며, 관리자 화면(브라우저)이 게임을 진행하고 정답을 검사합니다.

## 준비물
- Firebase 프로젝트 (무료)

## 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → **프로젝트 만들기**
2. 프로젝트 생성 후 **Realtime Database** 메뉴 → **데이터베이스 만들기**
3. 위치 선택 후 **테스트 모드에서 시작** 선택
4. (선택) 규칙 탭에서 이 폴더의 `database.rules.json` 내용을 붙여넣기

## 2. 웹 앱 설정값 넣기
1. 콘솔 상단 ⚙️ → **프로젝트 설정** → **내 앱** → 웹 아이콘(</>)으로 **앱 추가**
2. 표시되는 `firebaseConfig` 값을 복사해서
   `firebase/public/firebase-config.js` 파일에 붙여넣기

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "https://...-default-rtdb.firebaseio.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 3. GitHub로 배포하기

### 준비: GitHub 저장소 만들기
1. https://github.com 접속 → **New repository** 생성 (이름: 예: online-qr-quiz)
2. `firebase/` 폴더 안의 파일들을 저장소 **루트**에 올립니다.
   - `firebase.json`이 저장소 루트에 있어야 자동 배포가 동작합니다.

```bash
cd firebase
git init
git add .
git commit -m "온라인 QR 퀴즈 서바이벌"
git branch -M main
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```

### 방법 A: Firebase 콘솔에서 GitHub 연결 (자동 배포)
1. Firebase 콘솔 → **Hosting** → 시작하기
2. **GitHub 저장소 연결** 선택 → 방금 만든 저장소 선택
3. 배포 브랜치(`main`)와 공개 폴더(`public`) 확인 후 저장
4. 이후 GitHub에 push할 때마다 자동으로 배포됩니다

### 방법 B: Firebase CLI (수동 배포)
```bash
cd firebase
npm install -g firebase-tools
firebase login
firebase init hosting   # public 폴더 선택
firebase deploy
```

## 4. 사용 방법
1. 배포된 관리자 URL(`/index.html`)을 프로젝터에 띄우기
2. 화면의 **QR 코드**를 참가자들이 스캔 → 이름 입력
3. 문제를 미리 입력하고, **종료 기준 인원** 설정
4. 🚀 **게임 시작** → 정답 확인 후 **다음 문제** 클릭
5. 남은 인원이 기준 이하가 되면 자동으로 게임 종료 (최종 생존자에게 🎉 표시)

## 데이터 구조
```
/questions/{id}   { question, options[], answer }   ← 정답 포함 (관리자만 봄)
/game/status       waiting | playing | finished
/game/current      { number, total, question, options[], qid }  ← 정답 없음 (플레이어에게 전송)
/game/targetRemaining, /game/shuffle, /game/order, /game/currentNumber
/players/{id}      { name, alive, answer, result, correctAnswer }
```

## ⚠️ 보안 참고
간단한 방식을 위해 데이터베이스 규칙이 모두 허용(테스트 모드)입니다.
- 현재 출제 중인 문제(`/game/current`)에는 **정답이 포함되지 않아** 일반 참가자는 정답을 볼 수 없습니다.
- 다만 기술적인 참가자는 개발자 도구로 `/questions`의 정답을 읽을 수 있습니다.
- 정식 행사에서 정답 노출을 완전히 막으려면 Firebase Authentication + Cloud Functions 기반 방식으로 업그레이드해야 합니다.
