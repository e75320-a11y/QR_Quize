# 온라인 QR 퀴즈 서바이벌 (Supabase + GitHub Pages 버전)

Firebase 없이 **Supabase(무료)** + **GitHub Pages**로 배포하는 버전입니다.
실시간 동기화는 Supabase Realtime을 사용하며, 관리자 화면이 게임을 진행하고 정답을 검사합니다.

## 파일 구성
```
index.html           관리자 화면 (문제·정답 입력, 접속자 현황, 정답자 수)
player.html          플레이어 화면 (QR 스캔 후 접속)
admin.js / player.js
style.css / player.css
supabase-config.js   ← Supabase URL·키 입력 (필수)
setup.sql            ← Supabase SQL Editor에서 실행
.nojekyll
```

## 1. Supabase 준비
1. https://supabase.com 접속 → 무료 계정으로 가입
2. **New project** 생성 (지역은 아무거나)
3. 좌측 **SQL Editor** → **New query** → 이 폴더의 `setup.sql` 내용을 붙여넣고 **Run**
   - 테이블 생성, 실시간 구독 활성화, 보안(RLS) 해제, 기본 게임 행 생성이 자동으로 처리됩니다.

## 2. Supabase 설정값 입력
1. 좌측 ⚙️ **Project Settings → API**
2. **Project URL**과 **anon public** 키를 복사해서
   `supabase-config.js`에 붙여넣기

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

## 3. GitHub Pages 배포
1. GitHub에서 **New repository** 생성
2. **이 `supabase/` 폴더 안의 파일들을 저장소 루트에** 업로드 (또는 아래 명령)
```bash
cd supabase
git init
git add .
git commit -m "온라인 QR 퀴즈"
git branch -M main
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```
3. 저장소 **Settings → Pages → Build and deployment → Source** 를
   `Deploy from a branch` → 브랜치 `main`, 폴더 `/(root)` 로 설정 후 Save
4. 잠시 후 `https://사용자명.github.io/저장소명/` 에서 접속 확인

## 4. 사용 방법
1. **관리자 화면**: `https://사용자명.github.io/저장소명/` (프로젝터에 띄우기)
2. 화면의 **QR 코드**를 참가자들이 스캔 → 이름 입력
3. 문제·정답을 미리 입력하고, **종료 기준 인원** 설정
4. 🚀 **게임 시작** → 정답 확인 후 **다음 문제** 클릭
5. 남은 인원이 기준 이하가 되면 자동 종료 (최종 생존자에게 🎉 표시)

> QR 코드는 자동으로 플레이어 화면 주소(`.../player.html`)를 가리킵니다.

## 데이터 구조
```
questions         id, question, options[], answer
players           id(uuid), name, alive, answer, result, correct_answer
game (id=1)       status, current_number, question_order[], target_remaining, shuffle, current
```

## ⚠️ 보안 참고
간단한 방식을 위해 RLS를 비활성화했습니다.
- 출제 중인 문제(`game.current`)에는 정답이 포함되지 않아 일반 참가자는 정답을 볼 수 없습니다.
- 다만 기술적인 참가자는 개발자 도구로 `questions`의 정답을 읽을 수 있습니다.
- 정식 행사에서 완전한 보안이 필요하면 RLS + 정책 + 서버 검증 방식으로 업그레이드해야 합니다.
