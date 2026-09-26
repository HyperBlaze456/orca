// Neutral prose for the real-shaped Trivium fixtures: the lengths and the Korean/English mix
// follow the real harness data, the wording does not. Backtick spans exercise inline code.
const SENTENCES = [
  '노트는 먼저 기기 안에 저장되고, 연결이 돌아오면 바뀐 부분만 골라 만든 순서 그대로 서버로 보낸다.',
  'Notes are saved on the device first, and only the changed parts travel to the server once a connection returns.',
  '제목 옆의 작은 점은 아직 보내지 않은 수정이 남아 있다는 뜻이다.',
  'A small dot beside the title means some edits have not been sent yet.',
  '`sync log`에는 받아들인 변경마다 시각과 기기 이름이 한 줄씩 적힌다.',
  'Search looks at titles first, then body text, then attachments, and stops early once the list is full.',
  '검색어를 바꾸면 이전 결과는 바로 사라지고 새 결과가 위에서부터 채워진다.',
  'A cancelled export removes its partial file and reports how many pages it had already written.',
  '내보낸 파일의 첫 줄에는 만든 날짜와 노트 수가 적힌다.',
  'Shared notebooks show the name of the person who created each page.',
  '두 기기가 같은 문장을 다르게 고치면 두 판본을 나란히 보여 준다.',
  'When two devices change the same sentence differently, both versions stay side by side until one is chosen.',
  '밤마다 도는 점검은 스무 가지 동기화 상황을 같은 순서로 다시 돌린다.',
  'The nightly check replays twenty sync scenarios in a fixed order and keeps each timing for a month.',
  '첨부 파일이 크면 글을 먼저 보내고, 파일은 Wi-Fi가 연결될 때까지 기다린다.',
  'The `size cap` applies to one sync at a time, and anything larger rides along with the next round.',
  '`tag_index`는 태그가 붙거나 빠질 때만 다시 계산되고, 그 밖에는 그대로 쓰인다.',
  'This step leaves the file format alone and changes only how pages are ordered on screen.',
  'Search panel이 열려 있어도 입력은 막히지 않고, 결과는 조금 늦게 따라온다.',
  'A page opened from a search result scrolls straight to the first match and highlights it.',
  '설정에서 동기화를 끄면 기기 안의 노트는 그대로 두고 서버 사본만 멈춘다.',
  'Anyone reading a merged page can see which device sent each paragraph and at what time.'
]

/**
 * Whole sentences from the pool, starting at `seed`, up to `maxLength` characters; a blank
 * line after every third sentence. Always at least one sentence.
 */
export function fixtureProse(seed: number, maxLength: number): string {
  const parts: string[] = []
  let length = 0
  for (let index = 0; index < SENTENCES.length * 3; index += 1) {
    const sentence = SENTENCES[(seed + index) % SENTENCES.length]
    const separator = parts.length === 0 ? '' : parts.length % 3 === 0 ? '\n\n' : ' '
    if (parts.length > 0 && length + separator.length + sentence.length > maxLength) {
      break
    }
    parts.push(`${separator}${sentence}`)
    length += separator.length + sentence.length
  }
  return parts.join('')
}

/** A Theory node id the way milestones cite them (`kind.slug`). */
export function fixtureTheoryId(kind: string, seed: number): string {
  const words = ['journal', 'merge', 'cutoff', 'index', 'budget', 'marker', 'replay', 'review']
  return `${kind}.${words[seed % words.length]}-${words[(seed + 3) % words.length]}-${seed}`
}
