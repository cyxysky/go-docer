# Go 语言泛型详解

## 概述

Go 1.18 引入了泛型支持，允许编写可以处理多种数据类型的代码，而无需为每种类型编写重复的代码。

## 基本语法

### 1. 函数泛型

```go
// 基本语法：[T any] 定义类型参数
func PrintSlice[T any](slice []T) {
    for _, v := range slice {
        fmt.Printf("%v ", v)
    }
    fmt.Println()
}
```

**语法说明：**
- `[T any]` - 类型参数声明
- `T` - 类型参数名（可以是任何有效的标识符）
- `any` - 类型约束（等同于 `interface{}`）

### 2. 多个类型参数

```go
func Min[T Number](a, b T) T {
    if a < b {
        return a
    }
    return b
}
```

## 类型约束

### 内置约束

1. **`any`** - 等同于 `interface{}`，接受任何类型
2. **`comparable`** - 支持相等比较的类型（==, !=）
3. **`constraints.Ordered`** - 支持排序的类型（<, >, <=, >=）

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

**约束语法说明：**
- `~int` - 底层类型为 int 的类型（包括类型别名）
- `|` - 联合类型（或）
- `&` - 交集类型（且）

## 结构体泛型

```go
type Stack[T any] struct {
    items []T
}

// 泛型结构体的方法
func (s *Stack[T]) Push(item T) {
    s.items = append(s.items, item)
}

func (s *Stack[T]) Pop() (T, bool) {
    if len(s.items) == 0 {
        var zero T  // 零值
        return zero, false
    }
    item := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return item, true
}
```

## 接口泛型

```go
type Container[T any] interface {
    Add(item T)
    Get(index int) T
    Size() int
}

// 实现泛型接口
type List[T any] struct {
    items []T
}

func (l *List[T]) Add(item T) {
    l.items = append(l.items, item)
}
```

## 类型推断

Go 编译器可以自动推断类型参数：

```go
// 类型推断
PrintSlice([]int{1, 2, 3})        // 推断为 PrintSlice[int]
PrintSlice([]string{"a", "b"})    // 推断为 PrintSlice[string]

// 显式指定类型参数
PrintSlice[int]([]int{1, 2, 3})
```

## 高级用法

### 1. 类型转换函数

```go
func Map[T, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}
```

### 2. 泛型容器

```go
type GenericMap[K comparable, V any] map[K]V

func (gm GenericMap[K, V]) GetOrDefault(key K, defaultValue V) V {
    if value, exists := gm[key]; exists {
        return value
    }
    return defaultValue
}
```

### 3. 泛型通道

```go
type GenericChan[T any] chan T

func SendToChan[T any](ch GenericChan[T], value T) {
    ch <- value
}
```

## 最佳实践

### 1. 约束设计

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

### 2. 零值处理

```go
func SafeGet[T any](slice []T, index int) (T, bool) {
    if index < 0 || index >= len(slice) {
        var zero T  // 使用零值
        return zero, false
    }
    return slice[index], true
}
```

### 3. 类型参数命名

```go
// 使用有意义的名称
func ProcessItems[Item any](items []Item) { }
func CompareValues[Value comparable](a, b Value) bool { }
```

## 常见陷阱

### 1. 约束不匹配

```go
// 错误：comparable 不支持 < 操作
func Min[T comparable](a, b T) T {
    if a < b {  // 编译错误
        return a
    }
    return b
}

// 正确：使用 Ordered 约束
func Min[T constraints.Ordered](a, b T) T {
    if a < b {
        return a
    }
    return b
}
```

### 2. 类型推断失败

```go
// 当类型推断失败时，需要显式指定类型参数
var result = Map([]int{1, 2, 3}, func(n int) string {
    return fmt.Sprintf("%d", n)
})
```

### 3. 接口实现

```go
// 泛型类型不能直接实现接口
type MySlice[T any] []T

// 需要为具体类型实现接口
func (ms MySlice[int]) String() string {
    return fmt.Sprintf("MySlice with %d items", len(ms))
}
```

## 性能考虑

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