/**
 * BasicTokenizer TypeScript 实现
 * 基于 C++ BasicTokenizer 移植，实现文本清理、中文字符分词、标点符号处理等功能
 */
export class BasicTokenizer {
  private doLowerCase: boolean

  constructor(doLowerCase = true) {
    this.doLowerCase = doLowerCase
  }

  /**
   * 主要分词方法
   * @param text 输入文本
   * @returns 分词后的 token 数组
   */
  tokenize(text: string): string[] {
    // 1. 文本清理
    const cleanedText = this.cleanText(text)

    // 2. 中文字符分词
    const chineseTokenizedText = this.tokenizeCJKChars(cleanedText)

    // 3. 按空白符分词
    const originalTokens = this.whiteSpaceTokenize(chineseTokenizedText)

    // 4. 处理每个 token
    const splitTokens: string[] = []
    for (const token of originalTokens) {
      let processedToken = token

      if (this.doLowerCase) {
        processedToken = this.toLower(processedToken)
        processedToken = this.runStripAccent(processedToken)
      }

      // 按标点符号分割
      const subTokens = this.runSplitOnPunc(processedToken)
      splitTokens.push(...subTokens)
    }

    return this.whiteSpaceTokenize(splitTokens.join(' '))
  }

  /**
   * 文本清理：过滤无效字符，标准化空白符
   * @param text 输入文本
   * @returns 清理后的文本
   */
  private cleanText(text: string): string {
    const codePoints = this.utf8ToCodePoints(text)
    const filtered: number[] = []

    for (const cp of codePoints) {
      // 过滤条件：码点为0、0xFFFD或控制字符（排除特殊空白符）
      if (cp === 0 || cp === 0xFFFD || this.isControl(cp)) {
        continue
      }

      // 将空白符统一转换为空格
      if (this.isWhitespace(cp)) {
        filtered.push(0x20) // 空格码点
      }
      else {
        filtered.push(cp)
      }
    }

    return this.codePointsToUtf8(filtered)
  }

  /**
   * 中文字符分词：在 CJK 字符前后添加空格
   * @param text 输入文本
   * @returns 处理后的文本
   */
  private tokenizeCJKChars(text: string): string {
    const codePoints = this.utf8ToCodePoints(text)
    let output = ''

    for (const cp of codePoints) {
      if (this.isCJKCodePoint(cp)) {
        output += ` ${this.codePointToUtf8(cp)} `
      }
      else {
        output += this.codePointToUtf8(cp)
      }
    }

    return output
  }

  /**
   * 判断是否为 CJK（中日韩）字符
   * @param cp 码点
   * @returns 是否为 CJK 字符
   */
  private isCJKCodePoint(cp: number): boolean {
    return (
      // 基本CJK汉字 (U+4E00 ~ U+9FFF)
      (cp >= 0x4E00 && cp <= 0x9FFF)
      // CJK扩展A (U+3400 ~ U+4DBF)
      || (cp >= 0x3400 && cp <= 0x4DBF)
      // CJK扩展B (U+20000 ~ U+2A6DF)
      || (cp >= 0x20000 && cp <= 0x2A6DF)
      // CJK扩展C (U+2A700 ~ U+2B73F)
      || (cp >= 0x2A700 && cp <= 0x2B73F)
      // CJK扩展D (U+2B740 ~ U+2B81F)
      || (cp >= 0x2B740 && cp <= 0x2B81F)
      // CJK扩展E (U+2B820 ~ U+2CEAF)
      || (cp >= 0x2B820 && cp <= 0x2CEAF)
      // CJK兼容汉字 (U+F900 ~ U+FAFF)
      || (cp >= 0xF900 && cp <= 0xFAFF)
      // CJK兼容补充 (U+2F800 ~ U+2FA1F)
      || (cp >= 0x2F800 && cp <= 0x2FA1F)
    )
  }

  /**
   * 判断是否为控制字符
   * @param cp 码点
   * @returns 是否为控制字符
   */
  private isControl(cp: number): boolean {
    // 排除\t, \n, \r
    if (cp === 0x09 || cp === 0x0A || cp === 0x0D) {
      return false
    }

    // C0控制字符（ASCII控制符）和删除字符，以及C1控制符和部分Unicode控制区
    return (
      (cp <= 0x1F)
      || (cp >= 0x7F && cp <= 0x9F)
      || (cp >= 0x200B && cp <= 0x200F) // 零宽空格、方向控制
      || (cp >= 0x2028 && cp <= 0x202E) // 行/段落分隔符等
      || (cp >= 0x2060 && cp <= 0x206F) // 零宽连字符等
    )
  }

  /**
   * 判断是否为空白字符
   * @param cp 码点
   * @returns 是否为空白字符
   */
  private isWhitespace(cp: number): boolean {
    if (cp === 0x20 || cp === 0x09 || cp === 0x0A || cp === 0x0D) {
      return true
    }

    // Unicode空白符（Zs类别）
    return (
      cp === 0xA0 // 不换行空格
      || (cp >= 0x2000 && cp <= 0x200A) // 不同宽度空格
      || cp === 0x202F // 窄不换行空格
      || cp === 0x205F // 中数学空格
      || cp === 0x3000 // 全角空格
    )
  }

  /**
   * 转换为小写
   * @param text 输入文本
   * @returns 小写文本
   */
  private toLower(text: string): string {
    return text.toLowerCase()
  }

  /**
   * 去除重音符号
   * @param text 输入文本
   * @returns 去除重音后的文本
   */
  private runStripAccent(text: string): string {
    // 使用 Unicode 规范化去除重音符号
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036F]/g, '') // 去除组合符号
      .normalize('NFC')
  }

  /**
   * 按标点符号分割
   * @param text 输入文本
   * @returns 分割后的 token 数组
   */
  private runSplitOnPunc(text: string): string[] {
    const output: string[] = []
    let currentChunk = ''

    for (const char of text) {
      const cp = char.codePointAt(0)!
      if (this.isPunctuation(cp)) {
        if (currentChunk) {
          output.push(currentChunk)
          currentChunk = ''
        }
        output.push(char)
      }
      else {
        currentChunk += char
      }
    }

    if (currentChunk) {
      output.push(currentChunk)
    }

    return output
  }

  /**
   * 判断是否为标点符号
   * @param cp 码点
   * @returns 是否为标点符号
   */
  private isPunctuation(cp: number): boolean {
    // 处理 ASCII 特殊字符范围
    if (
      (cp >= 33 && cp <= 47) // [! - /]
      || (cp >= 58 && cp <= 64) // [:-@]
      || (cp >= 91 && cp <= 96) // [\[-`]
      || (cp >= 123 && cp <= 126) // [{-~]
    ) {
      return true
    }

    // Unicode 标点符号类别检测（简化版本）
    const char = String.fromCodePoint(cp)

    // 使用正则表达式检测 Unicode 标点符号
    return /\p{P}/u.test(char)
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
   * 将 UTF-8 字符串转换为码点数组
   * @param str UTF-8 字符串
   * @returns 码点数组
   */
  private utf8ToCodePoints(str: string): number[] {
    const codePoints: number[] = []

    for (const char of str) {
      const cp = char.codePointAt(0)
      if (cp !== undefined) {
        codePoints.push(cp)
      }
    }

    return codePoints
  }

  /**
   * 将码点数组转换为 UTF-8 字符串
   * @param codePoints 码点数组
   * @returns UTF-8 字符串
   */
  private codePointsToUtf8(codePoints: number[]): string {
    return String.fromCodePoint(...codePoints)
  }

  /**
   * 将单个码点转换为 UTF-8 字符串
   * @param cp 码点
   * @returns UTF-8 字符串
   */
  private codePointToUtf8(cp: number): string {
    return String.fromCodePoint(cp)
  }
}
