// 工具函数

// 获取状态显示文本
export const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    'pending': '等待中',
    'pulling': '拉取镜像',
    'creating': '创建中',
    'starting': '启动中',
    'initializing': '初始化',
    'running': '运行中',
    'stopped': '已停止',
    'failed': '失败'
  };
  return statusMap[status] || status;
};

// 获取文件图标
export const getFileIcon = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    'js': 'fab fa-js-square',
    'ts': 'fab fa-js-square',
    'py': 'fab fa-python',
    'go': 'fas fa-code',
    'java': 'fab fa-java',
    'php': 'fab fa-php',
    'html': 'fab fa-html5',
    'css': 'fab fa-css3-alt',
    'json': 'fas fa-file-code',
    'md': 'fab fa-markdown',
    'txt': 'fas fa-file-alt',
    'yml': 'fas fa-file-code',
    'yaml': 'fas fa-file-code',
    'xml': 'fas fa-file-code',
    'sql': 'fas fa-database'
  };
  return iconMap[ext || ''] || 'fas fa-file';
};

// 格式化字节大小
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 增量解析JSON字符串，提取所有可识别的字段
 * @param jsonString 不完整的JSON字符串
 * @returns 解析出的字段对象
 */
export function parseIncompleteJson(jsonString: string): Record<string, any> {
  const result: Record<string, any> = {};

  if (!jsonString || typeof jsonString !== 'string') {
    return result;
  }

  // 移除首尾空白字符
  const trimmedString = jsonString.trim();

  // 检查是否以 { 开头
  if (!trimmedString.startsWith('{')) {
    return result;
  }

  try {
    // 尝试完整解析
    return JSON.parse(trimmedString);
  } catch (error) {
    // 如果完整解析失败，进行增量解析
    return extractFields(trimmedString);
  }
}

/**
 * 提取JSON字符串中的字段
 * @param jsonString JSON字符串
 * @returns 解析出的字段对象
 */
export function extractFields(jsonString: string): Record<string, any> {
  const result: Record<string, any> = {};

  // 移除开头的 {
  let content = jsonString.substring(1);

  // 查找所有可能的键值对
  const pairs = findKeyValuePairs(content);

  for (const pair of pairs) {
    const parsed = parseKeyValue(pair);
    if (parsed) {
      result[parsed.key] = parsed.value;
    }
  }

  return result;
}

/**
 * 查找JSON字符串中的键值对
 * @param content JSON内容
 * @returns 键值对数组
 */
function findKeyValuePairs(content: string): string[] {
  const pairs: string[] = [];
  let current = '';
  let braceLevel = 0;
  let bracketLevel = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      current += char;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceLevel++;
      } else if (char === '}') {
        braceLevel--;
      } else if (char === '[') {
        bracketLevel++;
      } else if (char === ']') {
        bracketLevel--;
      } else if (char === ',' && braceLevel === 0 && bracketLevel === 0) {
        const trimmed = current.trim();
        if (trimmed) {
          pairs.push(trimmed);
        }
        current = '';
        continue;
      }
    }

    current += char;
  }

  // 添加最后一个键值对
  const trimmed = current.trim();
  if (trimmed) {
    pairs.push(trimmed);
  }

  return pairs;
}

/**
 * 解析单个键值对
 * @param pair 键值对字符串
 * @returns 解析后的键值对
 */
function parseKeyValue(pair: string): { key: string; value: any } | null {
  const colonIndex = pair.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }

  const keyPart = pair.substring(0, colonIndex).trim();
  const valuePart = pair.substring(colonIndex + 1).trim();

  const key = parseKey(keyPart);
  if (!key) {
    return null;
  }

  const value = parseValue(valuePart);
  return { key, value };
}

/**
 * 解析键名
 * @param keyPart 键名字符串
 * @returns 解析后的键名
 */
function parseKey(keyPart: string): string | null {
  if (keyPart.startsWith('"') && keyPart.endsWith('"')) {
    return keyPart.substring(1, keyPart.length - 1);
  }
  return keyPart;
}

/**
 * 解析值
 * @param valuePart 值字符串
 * @returns 解析后的值
 */
function parseValue(valuePart: string): any {
  try {
    return JSON.parse(valuePart);
  } catch (error) {
    return parsePrimitiveValue(valuePart);
  }
}

/**
 * 解析基本类型值
 * @param valuePart 值字符串
 * @returns 解析后的值
 */
function parsePrimitiveValue(valuePart: string): any {
  const trimmed = valuePart.trim();

  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.substring(1, trimmed.length - 1);
  }

  return trimmed;
}