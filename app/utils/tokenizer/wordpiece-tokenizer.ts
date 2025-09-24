/**
 * WordpieceTokenizer TypeScript 实现
 * 基于 C++ WordpieceTokenizer 移植，实现子词分解算法
 */
export class WordpieceTokenizer {
  private vocab: Map<string, number>
  private maxInputCharsPerWord: number
  private unkToken: string

  constructor(vocab: Map<string, number>) {
    this.vocab = vocab
    this.maxInputCharsPerWord = 200
    this.unkToken = '[UNK]'
  }

  /**
   * 分词方法
   * @param text 输入文本
   * @returns token 数组
   */
  tokenize(text: string): string[] {
    const outputTokens: string[] = []
    const tokens = this.whiteSpaceTokenize(text)

    for (const token of tokens) {
      const chars = this.splitUtf8(token) // 将单词拆分为 UTF-8 字符

      if (chars.length > this.maxInputCharsPerWord) {
        outputTokens.push(this.unkToken)
        continue
      }

      let isBad = false
      let start = 0
      const subTokens: string[] = []

      while (start < chars.length) {
        let end = chars.length
        let curSubstr = ''
        let found = false

        // 贪心找最长有效子词
        while (start < end) {
          // 从 start 到 end 拼接子字符串
          let substr = ''
          for (let i = start; i < end; i++) {
            substr += chars[i]
          }

          if (start > 0) {
            substr = `##${substr}`
          }

          // 检查是否在词汇表中
          if (this.vocab.has(substr)) {
            curSubstr = substr
            found = true
            break
          }
          end--
        }

        if (!found) {
          isBad = true
          break
        }

        subTokens.push(curSubstr)
        start = end // 移动起始位置到当前子词结尾
      }

      // 处理结果
      if (isBad) {
        outputTokens.push(this.unkToken)
      }
      else {
        outputTokens.push(...subTokens)
      }
    }

    return outputTokens
  }

  /**
   * 将字符串按 UTF-8 字符拆分
   * @param str 输入字符串
   * @returns UTF-8 字符数组
   */
  private splitUtf8(str: string): string[] {
    const chars: string[] = []

    // JavaScript 中可以直接使用字符串迭代器来获取正确的 Unicode 字符
    for (const char of str) {
      chars.push(char)
    }

    return chars
  }

  /**
   * 按空白符分词
   * @param text 输入文本
   * @returns token 数组
   */
  private whiteSpaceTokenize(text: string): string[] {
    return text.trim().split(/\s+/).filter((token) => token.length > 0)
  }

  /**
   * 设置最大输入字符数
   * @param maxChars 最大字符数
   */
  setMaxInputCharsPerWord(maxChars: number): void {
    this.maxInputCharsPerWord = maxChars
  }

  /**
   * 设置未知词标记
   * @param unkToken 未知词标记
   */
  setUnkToken(unkToken: string): void {
    this.unkToken = unkToken
  }

  /**
   * 获取词汇表大小
   * @returns 词汇表大小
   */
  getVocabSize(): number {
    return this.vocab.size
  }

  /**
   * 检查词汇表中是否包含某个词
   * @param token 要检查的 token
   * @returns 是否包含
   */
  hasToken(token: string): boolean {
    return this.vocab.has(token)
  }

  /**
   * 获取 token 的 ID
   * @param token token
   * @returns token ID，如果不存在返回 undefined
   */
  getTokenId(token: string): number | undefined {
    return this.vocab.get(token)
  }
}
