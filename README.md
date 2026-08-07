# fishhook

Fisheye 리뷰 화면에서 연결된 Jira 이슈의 Description을 바로 보여주는 Chrome Extension (Manifest V3).

Fisheye 리뷰 제목에서 Jira 이슈 키를 찾아, Jira REST API로 받아온 내용을 두 곳에 표시한다.

| 표시 위치 | 진입 | 동영상 |
|-----------|------|--------|
| **Objectives 영역** — 리뷰의 Objectives 본문을 Jira 내용으로 임시 교체 | Objectives 라벨 오른쪽 아이콘 버튼 | `<video>` 재생 |
| **Description 미리보기 패널** — 우측 하단 플로팅 패널 | 툴바 팝업 또는 우측 하단 FAB | `[VIDEO]` placeholder |

주입된 내용은 Fisheye 서버에 저장되지 않는다. 새로고침하면 원래 Objectives로 돌아간다.

## 설치 (개발자 모드)

빌드 단계가 없다. 저장소를 클론한 뒤 그대로 로드한다.

1. `chrome://extensions` → **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드** → 이 저장소 폴더 선택

## 설정

툴바 아이콘 → **환경설정**에서 다음을 지정한다.

| 항목 | storage 키 | 설명 |
|------|-----------|------|
| Jira 경로 | `fishhook.jiraBaseUrl` | 이슈를 가져올 Jira origin (`https://jira.example.com`) |
| Fisheye 경로 | `fishhook.fisheyeBaseUrl` | 확장이 동작할 Fisheye origin |
| Objectives 버튼 | `fishhook.showObjectivesButton` | Objectives 아이콘 버튼 표시 (기본 켬) |
| 미리보기 FAB | `fishhook.showDescriptionPanelFab` | 우측 하단 플로팅 버튼 표시 (기본 끔) |
| 언어 | `fishhook.language` | `auto` / `en` / `ko` |

Jira 내용은 브라우저의 **Jira 로그인 세션**(`credentials: 'include'`)으로 가져온다. Jira에 로그인되어 있지 않으면 오류 패널이 뜬다.

자세한 동작은 [options-page-design.md](docs/options-page-design.md) 참고.

## 구조

```text
manifest.json                    # MV3, content script 6개 + service worker
background.js                    # Jira REST 호출, ADF/첨부파일 해석, attachment fetch 프록시
src/
  adf-html.js                    # ADF -> HTML 폴백 (병합 셀 표 복원)
  i18n/i18n.js                   # 런타임 i18n (메시지 인라인)
  i18n/{ko,en}.yml               # 번역 원본 (참조용, 런타임 미사용 — AGENTS.md 참고)
content/
  fisheye-content.js/.css        # 이슈 키 추출, Objectives 버튼/주입, 패널 진입점
  desc-panel.js/.css             # 우측 하단 미리보기 패널
  description-renderer.js        # Jira HTML 후처리 (sanitize, 코드블록, 인라인 코드)
  media-loader.js                # 동영상 hydration (background 경유 blob URL)
  image-lightbox.js              # 클릭 전체화면 오버레이 (이미지/PDF/텍스트 공용)
  attachment-list.js             # 본문 하단 첨부파일 목록과 미리보기
options/, popup/                 # 환경설정 페이지, 툴바 팝업
test/                            # node --test 기반 테스트
docs/                            # 설계·구현 문서 (docs/README.md 참고)
```

동작 흐름과 메시지 계약은 [docs/architecture.md](docs/architecture.md)에 정리되어 있다.

## 테스트

```bash
node --test
```

의존성 없이 Node 내장 테스트 러너만 사용한다. `test/helpers/load-background.js`가 service worker 셰임을 만들어 `background.js`를 그대로 로드한다.

## 문서

[docs/README.md](docs/README.md)에 전체 목록이 있다.

## 기여

동작을 바꾸는 작업은 **문서 업데이트 + `manifest.json` 버전 상향 + 테스트 통과**까지
해야 완료다. 규칙은 [AGENTS.md](AGENTS.md)에 있다.

버전은 `manifest.json`의 `version` 필드가 유일한 소스다 (`package.json` 없음).
