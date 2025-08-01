# Go 泛型快速参考

## 基本语法

### 函数泛型
```go
func 函数名[类型参数 约束](参数列表) 返回值类型 {
    // 函数体
}
```

### 结构体泛型
```go
type 结构体名[类型参数 约束] struct {
    // 字段定义
}
```

### 接口泛型
```go
type 接口名[类型参数 约束] interface {
    // 方法定义
}
```

## 常用约束

### 内置约束
- `any` - 任何类型
- `comparable` - 可比较类型

### 自定义约束
```go
// 联合类型
type Number interface {
    ~int | ~int32 | ~int64 | ~float32 | ~float64
}

// 方法约束
type Stringer interface {
    String() string
}
```

## 常见模式

### 1. 基本泛型函数
```go
func PrintValue[T any](value T) {
    fmt.Printf("Value: %v\n", value)
}
```

### 2. 比较函数
```go
func Min[T Number](a, b T) T {
    if a < b {
        return a
    }
    return b
}
```

### 3. 容器结构体
```go
type Container[T any] struct {
    items []T
}

func (c *Container[T]) Add(item T) {
    c.items = append(c.items, item)
}
```

### 4. 工具函数
```go
func Map[T, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}
```

## 使用示例

### 类型推断
```go
PrintValue(42)        // 自动推断为 int
PrintValue("hello")   // 自动推断为 string
```

### 显式类型参数
```go
PrintValue[int](42)
PrintValue[string]("hello")
```

### 结构体实例化
```go
container := &Container[int]{}
container.Add(1)
container.Add(2)
```

## 重要注意

1. **方法不能有类型参数** - 但可以使用结构体的类型参数
2. **零值处理** - 使用 `var zero T` 获取类型 T 的零值
3. **约束匹配** - 确保约束支持所需的操作
4. **类型推断** - 编译器会自动推断类型参数

## 常见错误

### ❌ 错误：方法有类型参数
```go
func (c *Container[T]) Map[U any](fn func(T) U) []U {
    // 编译错误
}
```

### ✅ 正确：使用泛型函数
```go
func MapContainer[T, U any](container *Container[T], fn func(T) U) []U {
    // 正确的实现
}
```

### ❌ 错误：约束不匹配
```go
func Min[T comparable](a, b T) T {
    if a < b {  // 编译错误：comparable 不支持 <
        return a
    }
    return b
}
```

### ✅ 正确：使用合适的约束
```go
func Min[T Number](a, b T) T {
    if a < b {
        return a
    }
    return b
}
``` 