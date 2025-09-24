/**
 * Tokenizer 模块统一入口
 * 导出所有分词器相关的类和类型
 */

import { Tokenizer } from './tokenizer'

export { BasicTokenizer } from './basic-tokenizer'
export { FullTokenizer } from './full-tokenizer'
export { Tokenizer } from './tokenizer'
export { WordpieceTokenizer } from './wordpiece-tokenizer'

// 创建全局 tokenizer 实例
let globalTokenizer: Tokenizer | null = null

/**
 * 获取全局 tokenizer 实例
 * @returns Tokenizer 实例
 */
export function getGlobalTokenizer(): Tokenizer {
  if (!globalTokenizer) {
    globalTokenizer = new Tokenizer()
  }
  return globalTokenizer
}

/**
 * 初始化全局 tokenizer
 * @param vocabPath 词汇表路径
 */
export async function initializeGlobalTokenizer(vocabPath?: string): Promise<void> {
  const tokenizer = getGlobalTokenizer()
  await tokenizer.initialize(vocabPath)
}

/**
 * 检查全局 tokenizer 是否已初始化
 * @returns 是否已初始化
 */
export function isGlobalTokenizerInitialized(): boolean {
  return globalTokenizer?.isInitialized() ?? false
}

/**
 * 重置全局 tokenizer
 */
export function resetGlobalTokenizer(): void {
  globalTokenizer = null
}
