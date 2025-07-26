import { 
  AnsiEscape, 
  RemoveColorsTextRewriter, 
  TextRewriterTransform,
  TextRewriter
} from '@rushstack/terminal';
import type { TextRewriterState } from '@rushstack/terminal';

/**
 * 简单的控制字符过滤器
 * 使用正则表达式处理控制序列
 */
class TerminalControlFilter extends TextRewriter {
  initialize(): TextRewriterState {
    return {} as TextRewriterState;
  }
  
  process(state: TextRewriterState, text: string): string {
    // 移除ANSI转义序列
    let result = text.replace(/\x1b\[[0-9;]*[ABCDEFGHJKSTfhilmnpqrsu]/g, '');
    
    // 移除OSC序列
    result = result.replace(/\x1b\][0-9;]*[^\x07\x1b\\]*[\x07\x1b\\]/g, '');
    
    // 移除特定的控制字符
    result = result.replace(/[\x00\x07\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // 保留可打印字符和基本控制字符
    return result;
  }
  
  close(state: TextRewriterState): string {
    return '';
  }
}

/**
 * 终端数据处理器
 * 使用 @rushstack/terminal 处理终端输出数据
 */
export class TerminalDataProcessor {
  private controlFilter: TerminalControlFilter;
  
  constructor() {
    this.controlFilter = new TerminalControlFilter();
  }
  
  /**
   * 处理WebSocket接收到的原始数据
   */
  processWebSocketData(data: string | ArrayBuffer): string {
    let rawText = '';
    
    if (typeof data === 'string') {
      rawText = data;
    } else if (data instanceof ArrayBuffer) {
      // 尝试UTF-8解码
      try {
        rawText = new TextDecoder('utf-8').decode(data);
      } catch (error) {
        console.warn('Failed to decode ArrayBuffer as UTF-8:', error);
        // 降级处理：转换为字符码
        const uint8Array = new Uint8Array(data);
        rawText = String.fromCodePoint(...uint8Array);
      }
    } else {
      console.warn('Unknown data type:', typeof data);
      return '';
    }
    
    return this.processText(rawText);
  }
  
  /**
   * 处理文本数据，移除控制字符和ANSI转义序列
   */
  processText(text: string): string {
    if (!text || text.length === 0) {
      return '';
    }
    
    try {
      // 第一步：移除ANSI颜色代码
      let processedText = AnsiEscape.removeCodes(text);
      
      // 第二步：使用自定义过滤器移除控制字符
      const state = this.controlFilter.initialize();
      processedText = this.controlFilter.process(state, processedText);
      processedText += this.controlFilter.close(state);
      
      // 第三步：清理多余的空白字符
      processedText = this.cleanupWhitespace(processedText);
      
      return processedText;
    } catch (error) {
      console.error('Error processing terminal text:', error);
      // 降级处理：只移除基本的ANSI代码
      return AnsiEscape.removeCodes(text);
    }
  }
  
  /**
   * 清理多余的空白字符
   */
  private cleanupWhitespace(text: string): string {
    // 移除连续的空格
    text = text.replace(/\s{2,}/g, ' ');
    
    // 移除连续的空行
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // 移除行首行尾的空白
    const lines = text.split('\n');
    const cleanLines = lines.map(line => line.trim()).filter(line => line.length > 0);
    
    return cleanLines.join('\n');
  }
  
  /**
   * 检查文本是否包含控制字符
   */
  static hasControlCharacters(text: string): boolean {
    return /[\x00-\x1F\x7F]/.test(text) || text.includes('\x1b');
  }
  
  /**
   * 获取文本中的控制字符统计
   */
  static getControlCharacterStats(text: string): {
    ansiSequences: number;
    controlChars: number;
    totalChars: number;
  } {
    const ansiSequences = (text.match(/\x1b\[[0-9;]*[ABCDEFGHJKSTfhilmnpqrsu]/g) || []).length;
    const controlChars = (text.match(/[\x00-\x1F\x7F]/g) || []).length;
    
    return {
      ansiSequences,
      controlChars,
      totalChars: text.length
    };
  }
  
  /**
   * 重置处理器状态
   */
  reset(): void {
    // 重置控制过滤器状态
    const state = this.controlFilter.initialize();
    this.controlFilter.close(state);
  }
}

/**
 * 创建终端数据处理器实例
 */
export const terminalProcessor = new TerminalDataProcessor();

/**
 * 便捷函数：快速处理终端数据
 */
export function processTerminalData(data: string | ArrayBuffer): string {
  return terminalProcessor.processWebSocketData(data);
}

/**
 * 便捷函数：检查是否需要处理
 */
export function needsProcessing(data: string | ArrayBuffer): boolean {
  if (typeof data === 'string') {
    return TerminalDataProcessor.hasControlCharacters(data);
  }
  return true; // ArrayBuffer 通常需要处理
} 