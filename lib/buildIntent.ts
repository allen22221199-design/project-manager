import { BUILD_STEPS } from './notion'
import { buildingsOf } from './progressTags'

// 「跟 AI 說一句話就把施工進度的勾打起來」的判斷。
//
// 這裡刻意不交給 Gemini 判斷，用寫死的規則。理由：
//   ・詞彙是封閉的——只有五道工序、A~D 棟、完成／取消兩種動作，沒有模糊空間；
//   ・打錯勾比認不出來嚴重得多。認不出來使用者再講一次就好，打錯勾他不會發現；
//   ・順便修掉一個陷阱：講「A棟門片好了」本來會被歸成「記一筆進度紀錄」，
//     系統回「已新增」，但那五個勾一個都沒動，看起來像成功了。
//
// 條件很嚴：句子裡要同時出現「工序」和「完成／取消」的字眼才算數。
// 只提到工序（「門片還在噴漆」）就讓它照原本的流程走。

const DONE_RE = /完成|做完|做好|弄好|裝好|貼好|上好|好了|搞定|結束|收工|ok|OK|Ｏ?Ｋ/
const UNDO_RE = /還沒|沒有做|沒做|未完成|沒好|不算|取消|弄錯|打錯|錯了|回復|復原/

export type BuildTick = {
  steps: string[]        // 這句話講到的工序（可能一次講好幾道）
  buildings: string[]    // A / B / C / D
  done: boolean          // true = 打勾，false = 取消打勾
}

export function detectBuildTick(message: string): BuildTick | null {
  const msg = String(message ?? '')
  if (!msg.trim()) return null

  const steps = BUILD_STEPS.filter(s => msg.includes(s))
  if (steps.length === 0) return null

  // 「取消」要先判斷：「門片打錯了要取消」同時含「打錯」和「了」，
  // 先看完成會誤判成要打勾。取消的語氣比較明確，讓它優先。
  const undo = UNDO_RE.test(msg)
  const done = DONE_RE.test(msg)
  if (!undo && !done) return null

  return {
    steps: steps.slice(),
    buildings: buildingsOf(msg),
    done: !undo,
  }
}
