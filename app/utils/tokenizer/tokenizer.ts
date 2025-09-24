import { FullTokenizer } from './full-tokenizer'

/**
 * Tokenizer TypeScript 实现
 * 基于 C++ Tokenizer 移植，实现批处理和序列长度管理
 */
export class Tokenizer {
  private tokenizer: FullTokenizer
  private contextLength: number
  private static vocabPath = '/vocab.txt'

  constructor() {
    this.tokenizer = new FullTokenizer()
    this.contextLength = 52 // 默认上下文长度
  }

  /**
   * 异步初始化 tokenizer
   * @param vocabPath 词汇表路径
   */
  async initialize(vocabPath?: string): Promise<void> {
    const path = vocabPath || Tokenizer.vocabPath
    await this.tokenizer.loadVocab(path)
  }

  /**
   * 设置上下文长度
   * @param length 上下文长度
   */
  setContextLength(length: number): void {
    this.contextLength = length
  }

  /**
   * 获取上下文长度
   * @returns 上下文长度
   */
  getContextLength(): number {
    return this.contextLength
  }

  /**
   * 批量分词和编码
   * @param texts 文本数组
   * @returns token ID 的二维数组
   */
  tokenize(texts: string[]): number[][] {
    const clsId = this.tokenizer.getId('[CLS]')
    const sepId = this.tokenizer.getId('[SEP]')
    const padId = 0 // [PAD] token ID
    const maxContentLen = this.contextLength - 2 // 减去 [CLS] 和 [SEP]

    const allTokens: number[][] = []

    for (const text of texts) {
      // 分词并转换为 ID
      const tokens = this.tokenizer.tokenize(text)
      let tokenIds = this.tokenizer.convertByVocab(tokens)

      // 截断过长的序列
      if (tokenIds.length > maxContentLen) {
        tokenIds = tokenIds.slice(0, maxContentLen)
      }

      // 构建序列：[CLS] + content + [SEP] + padding
      const sequence: number[] = []
      sequence.push(clsId)
      sequence.push(...tokenIds)
      sequence.push(sepId)

      // 填充到固定长度
      const currentLength = sequence.length
      if (currentLength < this.contextLength) {
        const paddingLength = this.contextLength - currentLength
        for (let i = 0; i < paddingLength; i++) {
          sequence.push(padId)
        }
      }

      allTokens.push(sequence)
    }

    return allTokens
  }

  /**
   * 单个文本编码的便捷方法
   * @param text 输入文本
   * @returns token ID 数组
   */
  encode(text: string): number[] {
    const result = this.tokenize([text])
    return result.length > 0 ? result[0]! : []
  }

  /**
   * 解码 token ID 数组为文本
   * @param tokenIds token ID 数组
   * @returns 解码后的文本
   */
  decode(tokenIds: number[]): string {
    // 移除特殊 token（[CLS], [SEP], [PAD]）
    const filteredIds = tokenIds.filter((id) => {
      const word = this.getTokenById(id)
      return word !== '[CLS]' && word !== '[SEP]' && word !== '[PAD]'
    })

    return this.tokenizer.decode(filteredIds)
  }

  /**
   * 根据 ID 获取 token
   * @param id token ID
   * @returns token 字符串
   */
  getTokenById(id: number): string {
    try {
      return this.tokenizer.getWord(id)
    }
    catch {
      return '[UNK]'
    }
  }

  /**
   * 根据 token 获取 ID
   * @param token token 字符串
   * @returns token ID
   */
  getIdByToken(token: string): number {
    try {
      return this.tokenizer.getId(token)
    }
    catch {
      return this.tokenizer.getId('[UNK]')
    }
  }

  /**
   * 获取词汇表大小
   * @returns 词汇表大小
   */
  getVocabSize(): number {
    return this.tokenizer.getVocabSize()
  }

  /**
   * 检查 tokenizer 是否已初始化
   * @returns 是否已初始化
   */
  isInitialized(): boolean {
    return this.tokenizer.getVocabSize() > 0
  }

  /**
   * 包装单个文本为数组的便捷方法
   * @param text 输入文本
   * @returns 文本数组
   */
  private wrapToList(text: string): string[] {
    return [text]
  }

  /**
   * 静态方法：设置默认词汇表路径
   * @param path 词汇表路径
   */
  static setVocabPath(path: string): void {
    Tokenizer.vocabPath = path
  }

  /**
   * 静态方法：获取默认词汇表路径
   * @returns 词汇表路径
   */
  static getVocabPath(): string {
    return Tokenizer.vocabPath
  }

  /**
   * 静态编码方法（创建临时实例）
   * @param text 输入文本
   * @returns token ID 数组的 Promise
   */
  static async encode(text: string): Promise<number[]> {
    const tokenizer = new Tokenizer()
    await tokenizer.initialize()
    return tokenizer.encode(text)
  }

  /**
   * 获取内部的 FullTokenizer 实例（用于高级用法）
   * @returns FullTokenizer 实例
   */
  getFullTokenizer(): FullTokenizer {
    return this.tokenizer
  }

  /**
   * 批量编码的异步版本
   * @param texts 文本数组
   * @returns Promise<number[][]>
   */
  async tokenizeAsync(texts: string[]): Promise<number[][]> {
    // 对于大批量数据，可以在这里添加异步处理逻辑
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.tokenize(texts))
      }, 0)
    })
  }

  /**
   * 获取 token 的统计信息
   * @param text 输入文本
   * @returns 统计信息对象
   */
  getTokenStats(text: string): {
    originalLength: number
    tokenCount: number
    encodedLength: number
    truncated: boolean
  } {
    const tokens = this.tokenizer.tokenize(text)
    const maxContentLen = this.contextLength - 2
    const truncated = tokens.length > maxContentLen

    return {
      originalLength: text.length,
      tokenCount: tokens.length,
      encodedLength: this.contextLength,
      truncated,
    }
  }
}
