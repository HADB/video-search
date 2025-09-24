import { BasicTokenizer } from './basic-tokenizer'
import { WordpieceTokenizer } from './wordpiece-tokenizer'

/**
 * FullTokenizer TypeScript 实现
 * 基于 C++ FullTokenizer 移植，整合基础分词器和 WordPiece 分词器，实现词汇表加载
 */
export class FullTokenizer {
  private basicTokenizer: BasicTokenizer
  private wordpieceTokenizer: WordpieceTokenizer
  private vocabMap: Map<string, number> = new Map()
  private vocabList: string[] = []
  private inVocabMap: Map<number, string> = new Map()

  constructor(vocabFile?: string) {
    this.basicTokenizer = new BasicTokenizer(true)
    this.vocabMap = new Map()
    this.wordpieceTokenizer = new WordpieceTokenizer(this.vocabMap)

    if (vocabFile) {
      // 在实际使用时需要异步加载词汇表
      console.warn('词汇表需要异步加载，请使用 loadVocab 方法')
    }
  }

  /**
   * 异步加载词汇表
   * @param vocabUrl 词汇表文件 URL 或内容
   * @returns Promise
   */
  async loadVocab(vocabUrl: string): Promise<void> {
    try {
      console.log('正在加载词汇表:', vocabUrl)

      // 获取词汇表内容
      const response = await fetch(vocabUrl)
      if (!response.ok) {
        throw new Error(`加载词汇表失败: ${response.statusText}`)
      }

      const vocabContent = await response.text()
      this.parseVocab(vocabContent)

      console.log(`词汇表加载完成，共 ${this.vocabList.length} 个词汇`)
    }
    catch (error) {
      console.error('加载词汇表失败:', error)
      throw error
    }
  }

  /**
   * 从字符串内容解析词汇表
   * @param vocabContent 词汇表内容
   */
  private parseVocab(vocabContent: string): void {
    const tokens = vocabContent.split('\n')
    this.vocabMap.clear()
    this.vocabList = []

    let index = 0
    for (const token of tokens) {
      const trimmedToken = token.trim()
      if (trimmedToken) {
        this.vocabList.push(trimmedToken)
        this.vocabMap.set(trimmedToken, index)
        index++
      }
    }

    // 重新初始化 WordpieceTokenizer
    this.wordpieceTokenizer = new WordpieceTokenizer(this.vocabMap)
    this.initInVocab()
  }

  /**
   * 初始化反向词汇表映射
   */
  private initInVocab(): void {
    this.inVocabMap.clear()
    for (const [word, id] of this.vocabMap.entries()) {
      this.inVocabMap.set(id, word)
    }
  }

  /**
   * 获取词汇的 ID
   * @param word 词汇
   * @returns 词汇 ID
   */
  getId(word: string): number {
    const id = this.vocabMap.get(word)
    if (id === undefined) {
      throw new Error(`词汇不在词汇表中: ${word}`)
    }
    return id
  }

  /**
   * 根据 ID 获取词汇
   * @param id 词汇 ID
   * @returns 词汇字符串
   */
  getWord(id: number): string {
    const word = this.inVocabMap.get(id)
    if (word === undefined) {
      throw new Error(`ID 不在词汇表中: ${id}`)
    }
    return word
  }

  /**
   * 检查词汇是否在词汇表中
   * @param word 词汇
   * @returns 是否存在
   */
  hasWord(word: string): boolean {
    return this.vocabMap.has(word)
  }

  /**
   * 将词汇列表转换为 ID 列表
   * @param items 词汇数组
   * @returns ID 数组
   */
  convertByVocab(items: string[]): number[] {
    const output: number[] = []

    for (const item of items) {
      const id = this.vocabMap.get(item)
      if (id === undefined) {
        throw new Error(`词汇不在词汇表中: ${item}`)
      }
      output.push(id)
    }

    return output
  }

  /**
   * 将 ID 列表转换为词汇列表
   * @param ids ID 数组
   * @returns 词汇数组
   */
  convertByIds(ids: number[]): string[] {
    const output: string[] = []

    for (const id of ids) {
      const word = this.inVocabMap.get(id)
      if (word === undefined) {
        throw new Error(`ID 不在词汇表中: ${id}`)
      }
      output.push(word)
    }

    return output
  }

  /**
   * 分词方法
   * @param text 输入文本
   * @returns token 数组
   */
  tokenize(text: string): string[] {
    const splitTokens: string[] = []

    // 第一步：基础分词
    const baseTokens = this.basicTokenizer.tokenize(text)

    // 第二步：WordPiece 分词
    for (const token of baseTokens) {
      const subTokens = this.wordpieceTokenizer.tokenize(token)
      splitTokens.push(...subTokens)
    }

    return splitTokens
  }

  /**
   * 完整的编码流程：分词 + 转换为 ID
   * @param text 输入文本
   * @returns token ID 数组
   */
  encode(text: string): number[] {
    const tokens = this.tokenize(text)
    return this.convertByVocab(tokens)
  }

  /**
   * 完整的解码流程：ID 转换为词汇 + 拼接
   * @param ids token ID 数组
   * @returns 解码后的文本
   */
  decode(ids: number[]): string {
    const tokens = this.convertByIds(ids)

    // 简单的解码：去除 ## 前缀并拼接
    let result = ''
    for (const token of tokens) {
      if (token.startsWith('##')) {
        result += token.substring(2)
      }
      else {
        if (result && !this.isSpecialToken(token)) {
          result += ' '
        }
        result += token
      }
    }

    return result.trim()
  }

  /**
   * 判断是否为特殊 token
   * @param token token 字符串
   * @returns 是否为特殊 token
   */
  private isSpecialToken(token: string): boolean {
    return token.startsWith('[') && token.endsWith(']')
  }

  /**
   * 获取词汇表大小
   * @returns 词汇表大小
   */
  getVocabSize(): number {
    return this.vocabMap.size
  }

  /**
   * 获取词汇表列表的副本
   * @returns 词汇表列表
   */
  getVocabList(): string[] {
    return [...this.vocabList]
  }

  /**
   * 获取词汇表映射的副本
   * @returns 词汇表映射
   */
  getVocabMap(): Map<string, number> {
    return new Map(this.vocabMap)
  }

  /**
   * 字符串修剪工具方法
   * @param s 输入字符串
   * @returns 修剪后的字符串
   */
  static trim(s: string): string {
    return s.trim()
  }
}
