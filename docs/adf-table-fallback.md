# ADF 표 복원 (rowSpan / colSpan)

## 문제

Cloud Jira에서 **셀 병합(rowspan/colspan)이 있는 표**를 만들면, Objectives·미리보기 패널에 표가 **아예 표시되지 않는다.**

원인은 CSS나 렌더러가 아니라 Jira Cloud API 응답이다. `expand=renderedFields`의 HTML 변환기는 자기가 HTML로 못 바꾸는 ADF 노드를 버리고 **주석 자리표시자**만 남긴다.

```html
<p>본문 머리말입니다.</p>
<!-- ADF macro (type = 'table') -->
```

주석은 화면에 아무것도 그리지 않으므로 표가 사라진다. Jira 웹 화면 DOM에서 복사한 표 HTML(`<table data-testid="renderer-table">…`)은 Jira 프론트엔드가 ADF로 직접 그린 결과이고, 확장이 REST API로 받는 것과 다르다.

## 해결

`fields.description`(원본 ADF)에서 해당 노드를 직접 HTML로 만들어 주석 자리에 끼워 넣는다.

```text
background.js
  -> renderedFields.description  (표 자리에 <!-- ADF macro (type = 'table') --> )
  -> sanitizeHtml
  -> resolveMediaInHtml          (기존 미디어/URL 보정)
  -> restoreAdfMacroPlaceholders (ADF -> HTML 로 표 복원)
  -> restoreCascadedCodeFences / restoreSplitCodeBlocks
  -> restoreAdfTableWidths       (모든 표에 ADF 열 폭을 <colgroup>으로 복원)
  -> content/description-renderer.js
```

`restoreAdfTableWidths`가 맨 마지막인 이유: 위 복원 단계들이 표를 새로 만들어 넣을 수 있어서, 표가 전부 자리를 잡은 뒤에 세어야 ADF 노드와 순서가 맞는다.

### src/adf-html.js

`importScripts('src/adf-html.js')`로 service worker에 로드하고, `test/`에서는 `require()`로 같은 파일을 쓴다.

| export | 설명 |
|--------|------|
| `renderAdfNodeToHtml(node, options)` | ADF 노드 1개 → HTML 문자열 |
| `fillAdfMacroPlaceholders(html, adf, options)` | HTML의 `ADF macro` 주석을 타입이 같은 ADF 노드로 치환 |
| `applyAdfTableWidths(html, adf)` | HTML의 모든 `<table>`에 ADF 열 폭을 `<colgroup>`으로 주입 |

`options.renderMedia(mediaNode)`는 호스트(background.js)가 주입한다. `matchMediaToAttachment` → `createMediaElementHtml`로 첨부파일을 찾아 `<img>` / `<video>` / `[VIDEO]`를 만들고, 못 찾으면 `[media: 파일명]` placeholder로 떨어진다. 즉 `includeVideo` 옵션이 복원된 표 안 미디어에도 그대로 적용된다.

치환 규칙:

- 주석은 `<!--\s*ADF macro\s*\(\s*type\s*=\s*'…'\s*\)\s*-->` (쌍따옴표·공백 변형 허용)
- 같은 타입끼리 **문서 순서대로 1:1** 매칭 (표가 여러 개여도 순서 유지)
- ADF에 대응 노드가 없으면 주석을 **그대로 둔다** (임의 추측 금지)
- `html`에 `ADF macro`가 없거나 `adf`가 없으면 그대로 반환 → Server/DC(위키 마크업) 경로는 영향 없음

### 표 변환 규칙

| ADF | HTML |
|-----|------|
| `table` | `<table class="wiki-table" data-fishhook-adf-table="true"><tbody>` |
| `tableRow` | `<tr>` |
| `tableHeader` / `tableCell` | `<th>` / `<td>` |
| `attrs.colspan` / `attrs.rowspan` | `colspan` / `rowspan` (**값이 1이면 생략**) |
| `attrs.background` | `style="background-color:…"` (`#rgb`·`rgb()` 형태만 허용) |
| `attrs.colwidth` | 합계 대비 **비율(%)** 로 환산해 `<colgroup><col style="width:…%">` (아래 참고) |
| `attrs.width` | `style="--fishhook-table-width:…px"` (CSS가 `min(…, 100%)`로 씀) |

**표 폭과 열 폭은 Jira에서 따로 정해진다.** 표 가장자리를 끌면 `attrs.width`만 생기고, 열 구분선을 끌면 `colwidth`만 생긴다. 둘 중 하나만 있는 표가 흔하므로 각각 독립적으로 심는다.

| 무엇 | 어디에 | 값 | 마커 |
|------|--------|-----|------|
| 표 전체 폭 | `<table style="--fishhook-table-width:650px">` | `attrs.width`, 없으면 `colwidth` 합계 | `data-fishhook-tablewidth` |
| 열 비율 | `<col style="width:17.4114%">` | 각 `colwidth` ÷ 합계 | `data-fishhook-colwidth` |

CSS가 마커별로 조립한다.

- `data-fishhook-tablewidth` → `width: min(var(--fishhook-table-width), 100%)`. 넓은 화면에서는 Jira에서 잡은 픽셀 폭 그대로, 좁은 패널에서는 100%로 눌린다. 가로 스크롤은 생기지 않는다.
- `data-fishhook-colwidth` → 추가로 `table-layout: fixed`. **표가 어느 폭으로 정해지든 열 비율은 Jira와 같다** — %가 이긴 폭을 나누기 때문이다.

그래서 세 가지 경우가 모두 성립한다.

| ADF | 결과 |
|-----|------|
| `width` + `colwidth` | Jira와 같은 폭, 같은 열 비율 |
| `width`만 (표만 리사이즈) | Jira와 같은 폭, 열은 내용 기준 자동 (Jira 원본도 `colgroup` 없음) |
| 둘 다 없음 | 기존대로 `width: 100%` + 자동 배분 |

열 폭을 픽셀로 심지 않는 이유: 표가 100%로 눌릴 때 픽셀 열 합계(649px)가 표 폭(480px)을 넘어 깨진다. 비율이어야 두 경우 모두 성립한다.

Jira 렌더러도 같은 일을 한다 — `data-table-width="650"`, 셀 `data-colwidth="113/293/243"`인 표를 좁은 컨테이너에 그릴 때 `<col style="width:67px/175px/145px">`로 비례 축소한다.

### 열 폭은 두 경로 모두에서 복원해야 한다

`ADF macro` 주석은 **병합 셀이 있는 표에서만** 나온다. 병합이 없는 평범한 표는 Jira가 직접 HTML로 변환해 내려보내는데, 이때 **`colwidth`를 통째로 버린다.**

```html
<!-- Jira가 renderedFields로 준 것: 폭 정보 없음 -->
<table class="confluenceTable wiki-table"><tbody>
  <tr><th class="confluenceTh"><b>페이지명</b></th>…
```

그래서 `renderAdfNodeToHtml`(ADF → HTML)만 고치면 **병합 표에만** 폭이 붙고 대다수 표는 그대로다. `applyAdfTableWidths`가 완성된 HTML을 훑어 모든 `<table>`에 `<colgroup>`을 주입하는 이유다.

- 렌더된 `<table>`과 ADF의 `table` 노드를 **문서 순서대로 1:1** 매칭한다.
- **개수가 다르면 아무것도 하지 않는다.** 짝이 밀리면 엉뚱한 열이 넓어지는데, 그건 지금의 균등 분배보다 나쁘다.
- 이미 마커가 붙은 표(ADF에서 복원된 표)는 건너뛴다. 호스트가 준 `<colgroup>`이 있으면 그건 두고 표 폭만 심는다.

열 폭 수집 규칙 (`tableColumnWidths`, 두 경로 공용):

- 행을 순회하며 `colspan`만큼 열 인덱스를 전진시킨다. 병합 셀의 `colwidth`는 배열 원소가 덮는 열에 1:1로 배분된다 (`colspan: 2, colwidth: [100, 300]` → 25% / 75%).
- 각 열은 **처음 본 값**을 쓴다.
- **한 열이라도** 폭이 없거나 0·음수·숫자가 아니면 `colgroup`을 아예 만들지 않는다. 부분만 지정하면 표가 어긋나므로 전부 아니면 전무다. 이때도 `attrs.width`가 있으면 표 폭은 그대로 심는다.

표 밖의 노드도 같은 변환기를 쓰므로 셀 안의 문단·목록·코드블록·미디어·링크·마크(`strong`/`em`/`code`/`link`/`textColor` 등)가 함께 복원된다. 모르는 노드 타입은 내용만 재귀적으로 렌더링해 텍스트가 사라지지 않게 한다.

보안: 텍스트·속성은 모두 이스케이프하고, `href`는 `http(s):` / `mailto:` / `tel:` / `/`만 허용한다.

### CSS

`content/fisheye-content.css`

- `td > p` / `th > p` 기본 margin 제거 (ADF 셀은 내용을 `<p>`로 감싼다)
- `colgroup` / `col`에 `display: table-column-group` / `table-column` 강제 — 이 시트가 `table`·`tr`·`td`의 display를 `!important`로 덮는데 `colgroup`·`col`만 빠져 있어 호스트(Fisheye) CSS가 열 구조를 무너뜨릴 수 있었다.
- `table[data-fishhook-tablewidth]`에 `width: min(var(--fishhook-table-width, 100%), 100%)` — 기본 `width: 100% !important`를 덮는다. 두 선택자의 명시도는 (0,3,1)로 **동점**이라 뒤에 온 이 규칙이 이긴다. 순서를 바꾸면 조용히 깨지므로 이 블록을 기본 표 블록 위로 옮기지 말 것.
- `table[data-fishhook-colwidth]`에 `table-layout: fixed` — 기본값은 모든 표에 `table-layout: auto !important`인데, auto에서는 `col` 폭이 "제안"일 뿐이라 이미지나 긴 텍스트가 든 열이 지정한 비율을 밀어낸다. `colgroup`이 붙은 표에만 fixed로 뒤집는다. 셀에 이미 `overflow-wrap: anywhere`가 있어 fixed로 인한 넘침은 없다.

## 테스트

```bash
node --test test/adf-html.test.js test/background-integration.test.js
```

- `test/adf-html.test.js` — 변환기 단위 테스트 (병합 셀, 마크, 이스케이프, 자리표시자 치환 순서)
- `test/background-integration.test.js` — 실제 `background.js`를 service worker 셰임에 올려 `parseIssueDescription` 결과 검증

## 제한 사항

- **패널이 표보다 좁으면 텍스트 열이 여전히 좁다.** 표가 100%로 눌리면 열도 같이 줄어든다. 작성자가 Jira에서 첫 열을 전체 폭의 13% 정도로 잡았다면 480px 패널에서 그 열은 62px이다. 패널 좌상단 핸들로 넓히면 Jira 원래 크기까지 커지고 거기서 멈춘다.
- **열 너비를 한 번도 조정하지 않은 표는 폭 정보가 없다.** ADF에 `colwidth`가 안 실리므로 기존대로 `width: 100%` + 내용 기준 자동 배분이다.
- **`renderedFields`가 아예 비어 있는 경우**는 기존 ADF 평문 폴백([background.js](../background.js) `parseIssueDescription` 마지막 분기)을 그대로 쓴다. 이 경로는 표를 평문으로 납작하게 만든다.
- 표 외 다른 `ADF macro` 타입(`expand`, `panel`, `layoutSection` 등)도 ADF에 노드가 있으면 같은 방식으로 복원되지만, 실제 Jira가 어떤 타입에 자리표시자를 내는지는 인스턴스마다 다를 수 있다.

## 수동 검증 체크리스트

- [ ] Cloud Jira: `rowspan`/`colspan` 있는 표 → Objectives·미리보기 모두에 표 표시
- [ ] 병합 셀 안 이미지 → 표시되고 클릭 시 전체화면
- [ ] 미리보기 패널: 병합 표 안 동영상 → `[VIDEO]`만 표시
- [ ] 병합 없는 일반 표 → 기존과 동일하게 표시 (회귀 없음)
- [ ] Jira에서 열 너비를 조정한 **병합 없는** 표 → 같은 비율·같은 폭으로 보임 (renderedFields 경로)
- [ ] Jira에서 열 너비를 조정한 **병합 있는** 표 → 같은 비율·같은 폭으로 보임 (ADF 복원 경로)
- [ ] **표만 리사이즈하고 열은 안 건드린** 표 → Jira와 같은 폭, 열은 내용 기준 자동
- [ ] Objectives(넓은 화면) → 표가 Jira에서 잡은 폭에서 멈추고 화면을 꽉 채우지 않음
- [ ] 미리보기 패널을 표보다 좁게 줄임 → 표가 따라 줄고 **가로 스크롤이 생기지 않음**
- [ ] 좁은 열에 넓은 이미지가 든 표 → 이미지가 열 폭에 맞게 줄고 열 비율이 밀리지 않음
- [ ] 열 너비를 한 번도 조정하지 않은 표 → `colgroup` 없이 내용 기준 자동 배분 (기존 동작)
- [ ] Server/DC(위키 마크업) 이슈 → 기존과 동일
