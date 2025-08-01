# Go 语言泛型定义和使用详解

## 概述

Go 1.18+ 引入了泛型支持，允许编写可以处理多种数据类型的代码。本文档详细说明如何定义和使用Go泛型。

## 1. 函数泛型定义

### 基本语法
```go
func 函数名[类型参数 约束](参数列表) 返回值类型 {
    // 函数体
}
```

### 示例
```go
// 基本泛型函数
func PrintValue[T any](value T) {
    fmt.Printf("Value: %v, Type: %T\n", value, value)
}

// 多个类型参数
func Min[T Number](a, b T) T {
    if a < b {
        return a
    }
    return b
}

// 返回泛型类型
func CreateSlice[T any](values ...T) []T {
    return values
}
```

## 2. 类型约束定义

### 内置约束
- `any` - 等同于 `interface{}`，接受任何类型
- `comparable` - 支持相等比较的类型（==, !=）

### 自定义约束
```go
// 联合类型约束
type Number interface {
    ~int | ~int32 | ~int64 | ~float32 | ~float64
}

// 方法约束
type Stringer interface {
    String() string
}

// 复合约束
type Addable[T any] interface {
    Add(T) T
}
```

### 约束语法说明
- `~int` - 底层类型为 int 的类型（包括类型别名）
- `|` - 联合类型（或）
- `&` - 交集类型（且）

## 3. 结构体泛型定义

### 基本语法
```go
type 结构体名[类型参数 约束] struct {
    // 字段定义
}
```

### 示例
```go
// 基本泛型结构体
type Container[T any] struct {
    items []T
}

// 多个类型参数
type Pair[K comparable, V any] struct {
    Key   K
    Value V
}
```

### 结构体方法
```go
// 泛型结构体的方法
func (c *Container[T]) Add(item T) {
    c.items = append(c.items, item)
}

func (c *Container[T]) Get(index int) (T, bool) {
    if index < 0 || index >= len(c.items) {
        var zero T  // 零值
        return zero, false
    }
    return c.items[index], true
}
```

**重要注意：方法本身不能有类型参数，但可以使用结构体的类型参数**

## 4. 接口泛型定义

### 基本语法
```go
type 接口名[类型参数 约束] interface {
    // 方法定义
}
```

### 示例
```go
// 泛型接口
type Stack[T any] interface {
    Push(item T)
    Pop() (T, bool)
    IsEmpty() bool
    Size() int
}

// 实现泛型接口
type ArrayStack[T any] struct {
    items []T
}

func (s *ArrayStack[T]) Push(item T) {
    s.items = append(s.items, item)
}

func (s *ArrayStack[T]) Pop() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    item := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return item, true
}
```

## 5. 类型别名泛型

### 基本语法
```go
type 别名 = 泛型类型
```

### 示例
```go
// 泛型类型别名
type IntSlice = []int
type GenericSlice[T any] = []T

// 泛型映射类型
type StringMap[V any] = map[string]V
type GenericMap[K comparable, V any] = map[K]V
```

## 6. 通道泛型

### 示例
```go
// 泛型通道
type GenericChan[T any] = chan T

func SendToChan[T any](ch GenericChan[T], value T) {
    ch <- value
}

func ReceiveFromChan[T any](ch GenericChan[T]) T {
    return <-ch
}
```

## 7. 高级泛型用法

### 类型转换函数
```go
func Convert[T, U any](value T, converter func(T) U) U {
    return converter(value)
}
```

### 条件泛型
```go
func SafeGet[T any](slice []T, index int) (T, bool) {
    if index < 0 || index >= len(slice) {
        var zero T
        return zero, false
    }
    return slice[index], true
}
```

### 递归泛型
```go
type Node[T any] struct {
    Value T
    Next  *Node[T]
}

func (n *Node[T]) Add(value T) {
    if n.Next == nil {
        n.Next = &Node[T]{Value: value}
    } else {
        n.Next.Add(value)
    }
}
```

### 泛型工具函数
```go
// Filter 函数
func Filter[T any](slice []T, predicate func(T) bool) []T {
    var result []T
    for _, item := range slice {
        if predicate(item) {
            result = append(result, item)
        }
    }
    return result
}

// Reduce 函数
func Reduce[T, U any](slice []T, initial U, reducer func(U, T) U) U {
    result := initial
    for _, item := range slice {
        result = reducer(result, item)
    }
    return result
}
```

## 8. 使用示例

### 基本使用
```go
// 函数泛型使用
PrintValue(42)        // 类型推断
PrintValue("hello")   // 类型推断
PrintValue(3.14)      // 类型推断

// 显式指定类型参数
PrintValue[int](42)
PrintValue[string]("hello")
```

### 结构体使用
```go
// 创建泛型结构体实例
container := &Container[int]{}
container.Add(1)
container.Add(2)
container.Add(3)

// 使用泛型函数
strings := MapContainer(container, func(n int) string {
    return fmt.Sprintf("number_%d", n)
})
```

### 接口使用
```go
// 使用泛型接口
var stack Stack[string] = &ArrayStack[string]{}
stack.Push("first")
stack.Push("second")

for !stack.IsEmpty() {
    if item, ok := stack.Pop(); ok {
        fmt.Printf("Popped: %s\n", item)
    }
}
```

## 9. 类型推断

Go 编译器可以自动推断类型参数：

```go
// 类型推断示例
PrintValue(42)        // 推断为 PrintValue[int]
PrintValue("hello")   // 推断为 PrintValue[string]

// 当类型推断失败时，需要显式指定
var result = Convert(42, func(n int) string {
    return fmt.Sprintf("%d", n)
})
```

## 10. 最佳实践

### 约束设计
```go
// 好的约束设计
type Number interface {
    ~int | ~int32 | ~int64 | ~float32 | ~float64
}

// 避免过于宽泛的约束
type BadConstraint interface {
    any  // 太宽泛，失去了类型安全
}
```

### 零值处理
```go
func SafeGet[T any](slice []T, index int) (T, bool) {
    if index < 0 || index >= len(slice) {
        var zero T  // 使用零值
        return zero, false
    }
    return slice[index], true
}
```

### 类型参数命名
```go
// 使用有意义的名称
func ProcessItems[Item any](items []Item) { }
func CompareValues[Value comparable](a, b Value) bool { }
```

## 11. 常见陷阱

### 约束不匹配
```go
// 错误：comparable 不支持 < 操作
func Min[T comparable](a, b T) T {
    if a < b {  // 编译错误
        return a
    }
    return b
}

// 正确：使用 Number 约束
func Min[T Number](a, b T) T {
    if a < b {
        return a
    }
    return b
}
```

### 方法类型参数
```go
// 错误：方法不能有类型参数
func (c *Container[T]) Map[U any](fn func(T) U) []U {
    // 编译错误
}

// 正确：使用泛型函数
func MapContainer[T, U any](container *Container[T], fn func(T) U) []U {
    // 正确的实现
}
```

## 12. 性能考虑

1. **编译时实例化** - 泛型在编译时生成具体类型的代码
2. **无运行时开销** - 与手动编写的类型特定代码性能相同
3. **代码膨胀** - 每个具体类型都会生成独立的代码副本

## 总结

Go 泛型提供了：
- 类型安全的代码复用
- 编译时类型检查
- 零运行时开销
- 清晰的语法和约束系统

通过合理使用泛型，可以编写更通用、更安全的代码，同时保持 Go 语言的简洁性和性能。 