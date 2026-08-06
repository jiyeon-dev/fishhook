# docs

| 문서 | 내용 |
|------|------|
| [architecture.md](./architecture.md) | 전체 흐름, 메시지 계약, HTML 파이프라인, 테스트 범위 — **여기부터** |
| [jira-media-handling.md](./jira-media-handling.md) | 이미지·동영상 처리. 첨부파일 매칭, 썸네일 승격, media card, `includeVideo` |
| [adf-table-fallback.md](./adf-table-fallback.md) | 병합 셀(rowspan/colspan) 표가 사라지는 문제와 ADF → HTML 복원 |
| [objectives-icon-button-design.md](./objectives-icon-button-design.md) | Objectives 아이콘 버튼: 위치, 상태, 클릭 흐름, 활성화 조건 |
| [options-page-design.md](./options-page-design.md) | 환경설정 페이지와 툴바 팝업: 설정 항목, 검증, 토스트 |

## 문서 규칙

- **코드를 고쳤으면 문서도 같이 고친다.** 선택이 아니라 완료 조건이다
  ([AGENTS.md](../AGENTS.md) 참고). 문서 업데이트와 `manifest.json` 버전 상향이
  빠진 작업은 끝난 게 아니다.
- 구현이 끝난 뒤에도 **동작 규칙**을 남긴다. 계획 일정이나 미구현 파일 목록은 남기지 않는다.
- 각 문서 하단에 **수동 검증 체크리스트**를 둔다. UI는 자동 테스트가 없다.
- 새 동작이 어느 문서에도 속하지 않으면 가장 가까운 문서에 절을 추가한다.
  문서를 새로 만들었으면 위 표에 한 줄 추가한다.
