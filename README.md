# 부산 1박 2일 길라잡이 (2026.11.28–29)

5인 부산 1박 2일 여행용 모바일 길라잡이. 단일 정적 파일(`index.html`)이라 별도 빌드 없이 열면 동작한다.

## 기능

- **실시간 대시보드**: 지금 진행 중인 코스(NOW)와 다음 코스(NEXT), 종료까지 남은 시간, 여유·지연 배지
- **시뮬레이션 모드**: 여행 전·후에도 DAY 1 / DAY 2 시각 슬라이더·프리셋·데모 재생으로 미리 확인
- **내 위치 대조**: GPS(또는 가상 위치)와 각 스팟의 직선거리·도보 예상 시간, 가장 가까운 스팟 표시
- **지도·로드맵**: Leaflet + OpenStreetMap 동선 미니맵(1~17번 마커, DAY별 색 · 서울역 집합은 동선 밖), DAY 탭 타임라인
- **길찾기**: 코스마다 카카오맵 길찾기 / 네이버지도 검색 링크
- **공유 메모·사진**: 코스별 메모와 사진을 Supabase(`trip_notes`/`trip-photos`)에 올려 5인이 함께 봄
- **💰 여행 정산**: 지출을 넣으면 총액·1인 평균·멤버별 결제/부담/차액과 **최소 송금 목록**을 자동 계산, 카톡 복사용 요약, 영수증 사진 첨부(`trip_expenses`)
- **✅ 공유 체크리스트(웹에서 직접 편집)**: 필수 사전 예약 항목을 5인이 실시간 공유(`trip_checklist`) — 누가 체크했는지 "영진 완료"로 표시, 45초마다 동기화, 오프라인 시 이 기기 저장본으로 폴백. 실용 정보 시트에서 **＋ 항목 추가 / ✏️ 수정 / 🗑️ 삭제**가 되고, 목록 정의는 `item_key = info_checklist_items` 행의 `checked_by`(JSON `[{id,title,sub,required}]`)에 저장돼 5인에게 함께 반영된다(초기값은 기본 6항목). 체크 상태 조회는 `info_` 키를 제외하고 불러오며, 초기화도 `info_` 키는 절대 건드리지 않는다
- **실용 정보**: 5인 예상 경비, KTX·연락처
- **🌤️ 부산 날씨·드론쇼 체크**: Open-Meteo(키 불필요)에서 해운대·광안리 현재 날씨(기온·체감·바람·돌풍·습도)와 11/28·29 주요 시간대(스카이캡슐 13:00 · 드론쇼 19:00 · 체크아웃 09:00 · KTX 14:47) 예보를 실시간 표시. 드론쇼 시간 바람이 4.5 m/s를 넘으면 주의, 6 m/s 이상·강수 60% 이상이면 취소 가능성 배지로 경고. 9번 코스 카드에도 날씨 배지, 광안리 M 드론라이트쇼 공식 공지 링크. 카드 기본값은 **접힘** — 헤더 한 줄(현재 기온 · 드론쇼 19시 체감)만 보이고, 누르면 상세가 펼쳐진다
- **💬 5인 톡방**: 추가 SQL 없이 기존 `trip_notes` 테이블의 **`spot_id = 0`**을 단체 채팅방으로 재사용(1~17번 코스 메모 카운트와 분리). 우하단 FAB 배지에 안 읽은 메시지 수, 카카오톡식 좌우 말풍선·작성자·시각·사진 말풍선(라이트박스)·본인 메시지 삭제, Enter 전송, 1400px/0.82 압축 사진 업로드. 열려 있는 동안 3초 폴링 + Supabase Realtime Broadcast(`realtime:busan-chat`)로 즉시 반영, 닫혀 있으면 45초 폴링이 배지를 갱신
- **🎫 KTX·숙소 공유 보드**: 숙소(한화리조트 해운대) 호실·메모와 KTX 하행(11/28)·상행(11/29) 5인 호차·좌석을 입력해 공유. 추가 SQL 없이 기존 `trip_checklist` 테이블을 `info_room`·`info_ktx_{down|up}_{이름}` 키로 재사용하며, 45초 폴링·오프라인 폴백. 체크리스트 초기화는 `info_` 키를 건드리지 않도록 조회·저장을 분리했고, 1·17번 KTX 코스 카드에 좌석 배지 표시
- **👋 세션 기반 작성자("지금 접속한 사람이 누구야?")**: 기본 작성자를 `localStorage`로 자동 선택하지 않고 `sessionStorage`만 쓴다. 이름 미선택 상태에서 톡방·공유 메모(펼치기/남기기)·정산 폼·체크리스트 체크·편집·KTX 보드처럼 이름이 남는 동작을 처음 시도하면 선택 모달이 뜨고, 고른 뒤 원래 하려던 동작이 그대로 이어진다(새 탭·새 세션에서는 다시 묻는다). 공유 메모 바에는 `미선택 (클릭해 선택)` / `영진 (변경)` 상태가 표시된다
- **🦸 느그맨 AI 상담 ("도와줘요 느그맨!")**: 화면 우측 중앙에 망토 두른 느그맨이 둥실둥실 떠 있다(우하단 💬 톡방 FAB와 겹치지 않게 배치). 누르면 "도와줘요 느그맨!" 말풍선이 뽁 하고 뜬 뒤 대화 시트가 열린다. 추천 질문 칩 4개(정산·다음 코스·드론쇼 날씨·남은 체크리스트), 멀티턴 말풍선, Enter 전송, `느그맨이 계산 중…` 로딩. 질문마다 사이트의 **최신 실시간 상태**(현재 시각·접속자·17개 코스 NOW/NEXT·Open-Meteo 날씨·드론쇼 19시 바람/강수·정산 계산 결과·체크리스트·코스 메모·톡방 최근 대화·KTX/숙소 보드·GPS 위치)를 JSON 컨텍스트로 함께 보낸다. 접속자를 고르지 않아도 바로 상담 가능
- **🎮 커피내기 미니게임 (2종)**: 하단 FAB `🎮 게임`, 본문 카드, 실용 정보 시트, 톡방 헤더 🎮로 연다. ① **⚡ 반응속도 / 👀 눈치게임**은 Supabase Realtime Broadcast(`realtime:busan-minigame`, DB 스키마 변경 없음)로 각자 폰이 실시간 대결 — 준비(Ready) → 방장 시작 → 랜덤 1.8~4.6초 뒤 초록 신호가 뜨면 각자 터치, ms 순위표에서 **제일 늦은 사람(또는 신호 전 부정출발)**이 커피 당첨. 눈치게임은 1번부터 차례로 숫자를 외치고 **같은 숫자를 동시에 누르거나 마지막까지 못 외친 사람**이 당첨. 3초 하트비트로 접속자 명단이 자동으로 모이고, 혼자면 연습 모드로 돈다. ② **🃏 부산 복불복 카드**는 참가 인원(5명 중 토글)·내기 항목(프리셋 + 직접 입력)을 정한 뒤 광안대교·돼지국밥·해운대 파도·스카이캡슐 같은 부산 카드를 순서대로 한 장씩 뒤집어 `🦅 갈매기한테 새우깡 뺏김!` 꽝 1장을 뽑은 사람이 당첨(한 폰 돌려가며 / 각자 폰). 결과 화면의 **📢 톡방에 결과 박제**가 `trip_notes`(`spot_id=0`)에 결과를 남기고 웹푸시도 함께 보낸다.
- **🏆 카드깡 최다빈도 vs 현금인출기 칭호판**: 정산 시트 맨 위 카드. 실시간 `trip_expenses`에서 5인(영진·지현·준섭·명강·윤지)의 **총 결제액·총 부담액·순정산(+/−)·결제 건수**를 다시 계산해 1인 1칭호를 자동으로 붙인다 — 결제액 1위(💸 카드깡 최다빈도), 받을 돈 1위(👑 채권왕), 순정산 마이너스 1위(🏧 현금인출기, 결제는 했는데 더 낼 사람은 🥲 마이너스 요정), 결제 2건 이상(🧾 프로 결제러), 소액 결제(🪙 소소한 결제러), 차액 0원(⚖️ 칼정산), 결제·부담 0원(👀 지갑 안 연 사람), 지출 0건(🌱 첫 지출 대기). 동액·동점은 같은 칭호를 공유하고 0원은 순위 없음(–)으로 표시한다. 상단에 카드깡 최다빈도/현금인출기 대결 패널, 아래에 결제액 리더보드(순위·칭호·결제/부담·순정산, 내 줄은 `나` 표시). **📢 톡방에 칭호 박제**를 누르면 현재 칭호판이 `trip_notes`(`spot_id=0`) 톡방에 올라가고 `busan-title` 태그로 웹푸시도 나간다
- **🔔 웹 푸시 알림 (PWA)**: 헤더 종 아이콘(`🔕`/`🔔`) → 알림 시트에서 기기별로 켜고 끈다. 켜면 **톡방 새 메시지·사진**과 **정산 지출 등록**이 다른 참석자 폰으로 푸시된다(보낸 사람 기기·작성자는 제외). `🧪 테스트 알림 보내기`로 바로 확인. 안드로이드는 크롬·삼성 인터넷에서 그대로, **아이폰은 iOS 16.4+ 사파리에서 공유(□↑) → '홈 화면에 추가' 후 홈 아이콘으로 연 상태**에서만 동작하며, 일반 사파리 탭에서는 설치 안내 배너를 띄운다. 구성: `manifest.json` + `sw.js` + `icons/icon-192.png`·`icon-512.png`(maskable 포함)

- **🏛️ 공문서(대외비 작전서) 테마 + 즉시 전환**: 기본 테마는 `official`. 명조체(Noto Serif KR), 배경 `#e5e7eb`·문서 카드 `#fcfcf9`, 직각 모서리, 1px/2px `#111` 검정 선, 빨간 도장 포인트(`#b91c1c`). 본문 맨 위에 결재 헤더(분류 대외비(5인 팟 전용) + `원본대조필` 도장, `대 한 민 국 · 느 그 여 행 사`, `부산광역시 1박 2일 원정 계획`, `문서번호 제2026-1128호`, 결재란 기안 권영진 印 · 검토 김지현 印 · 협조 송준섭 · 승인 허명강·김윤지 決)가 공문서 모드에서만 보인다. 헤더 하단 우측 `✨ 원본 디자인` / `🏛️ 공문서 모드` 버튼으로 새로고침 없이 전환되고 `document.body.dataset.theme`이 바뀌며, 선택은 `localStorage['busan-theme-v1']`에 남는다. 원본 디자인은 `original`로 기존 스타일 그대로(지도 타일도 컬러로 돌아온다)

## AI 상담 백엔드 (Supabase Edge Function `busan-ai`)

- 소스: [`supabase/functions/busan-ai/index.ts`](supabase/functions/busan-ai/index.ts) — Gemini API를 호출해 답변 텍스트를 돌려준다. 프론트엔드는 `POST {SUPABASE_URL}/functions/v1/busan-ai`에 `{ messages, context }`를 보낸다(apikey = publishable key, `verify_jwt: false`, CORS `*`).
- **키는 코드·저장소·프론트엔드에 없다.** Gemini 키는 Supabase Secret `GEMINI_API_KEY`에만 저장한다.
- 모델: 1순위 `gemini-3.1-flash-lite`(응답 1~2초) → 실패 시 `gemini-3.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.5-flash` 폴백. 2026-11 기준 신규 프로젝트에서 `gemini-2.5-flash`·`gemini-2.0-flash`는 404(no longer available to new users)라 단독 사용 불가.
- 배포(시크릿·토큰은 절대 리포지토리에 커밋하지 않는다):

```bash
# 1) 시크릿 등록 (Management API)
curl -X POST "https://api.supabase.com/v1/projects/<ref>/secrets" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '[{"name":"GEMINI_API_KEY","value":"<key>"}]'

# 2) 함수 배포 (multipart: metadata + 소스 파일)
curl -X POST "https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=busan-ai" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -F 'metadata={"name":"busan-ai","entrypoint_path":"index.ts","verify_jwt":false}' \
  -F 'file=@supabase/functions/busan-ai/index.ts;type=application/typescript'
```

## 웹 푸시 알림 백엔드 (Supabase Edge Function `push-notify`)

- 소스: [`supabase/functions/push-notify/index.ts`](supabase/functions/push-notify/index.ts) — Web Push(RFC 8291 `aes128gcm` + RFC 8292 VAPID)를 Deno 표준 WebCrypto만으로 구현했다(외부 라이브러리 없음). FCM·Apple(`web.push.apple.com`) 등 표준 엔드포인트로 실제 발송한다.
- 구독 저장: `push_subscriptions`(id, author, endpoint unique, p256dh, auth, ua, updated_at) — 프론트가 `on_conflict=endpoint` upsert, RLS 공개 정책.
- 액션: `test`(특정 endpoint로 테스트 푸시) / `broadcast`(`exclude_endpoint`·`exclude_author` 제외 전체 발송, 404·410 응답 시 해당 구독 자동 삭제). `verify_jwt: false`, CORS `*`.
- **VAPID 공개키만 `index.html`에 있고, 비공개키는 Supabase Secret에만 있다.** 저장소·프론트엔드에 `VAPID_PRIVATE_KEY`가 들어가지 않는다.
  - Secrets: `VAPID_PRIVATE_KEY`(base64url 32바이트 P-256 d), `VAPID_PUBLIC_KEY`(base64url 65바이트 비압축점), `VAPID_SUBJECT`(`https://djdufs.github.io/Busan-trip/`)
- 배포(시크릿·토큰은 절대 리포지토리에 커밋하지 않는다):

```bash
# 1) VAPID 시크릿 등록 (Management API)
curl -X POST "https://api.supabase.com/v1/projects/<ref>/secrets" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '[{"name":"VAPID_PRIVATE_KEY","value":"<base64url>"},{"name":"VAPID_PUBLIC_KEY","value":"<base64url>"},{"name":"VAPID_SUBJECT","value":"https://djdufs.github.io/Busan-trip/"}]'

# 2) 함수 배포 (JSON body 방식)
curl -X POST "https://api.supabase.com/v1/projects/<ref>/functions" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json;print(json.dumps({"slug":"push-notify","name":"push-notify","verify_jwt":False,"body":open("supabase/functions/push-notify/index.ts").read()}))')"

# 3) 상태 확인
curl "https://<ref>.supabase.co/functions/v1/push-notify" -H "apikey: <publishable>"
```

- 알림 클릭 시 `sw.js`가 `/Busan-trip/` 창을 포커스하고 `data.url`(`#chat`·`#settle`)로 이동한다. 앱은 그 해시를 보고 해당 시트를 연다(이름이 이미 선택된 세션에서).

## 배포

GitHub Pages(`main` 브랜치 루트)에서 바로 서비스된다.

- https://djdufs.github.io/Busan-trip/

## 좌표 출처

모든 장소 좌표·도로명 주소는 Kakao Map 장소 검색 결과(2026-11-24 조회)를 사용했다. 지도 타일은 OpenStreetMap.
