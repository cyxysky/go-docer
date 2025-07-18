package main

import (
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

type Person struct {
	name  string
	age   uint
	email string
}

func (p *Person) introduce() {
	fmt.Println("大家好，我是" + p.name + "我几岁了" + strconv.FormatUint(uint64(p.age), 10))
}

func (p *Person) vaildateEmail() bool {
	return strings.Contains(p.email, "@")
}

type Persons []Person

func (p *Persons) sortByField(field string) {
	sort.Slice(*p, func(i int, j int) bool {
		vi := reflect.ValueOf((*p)[i])
		vj := reflect.ValueOf((*p)[j])
		v1 := vi.FieldByName(field)
		v2 := vj.FieldByName(field)
		switch v1.Kind() {
		case reflect.Uint:
			return v1.Uint() < v2.Uint()
		case reflect.String:
			return v1.String() < v2.String()
		default:
			return false
		}
	})
}

func main() {
	p := Person{
		name:  "张三",
		age:   20,
		email: "zhangsan@example.com",
	}
	p.introduce()
	if p.vaildateEmail() {
		fmt.Println("邮箱格式正确")
	} else {
		fmt.Println("邮箱格式不正确")
	}
	persons := Persons{
		{name: "王五", age: 22, email: "wangwu@example.com"},
		{name: "张三", age: 20, email: "zhangsan@example.com"},
		{name: "李四", age: 21, email: "lisi@example.com"},
	}
	persons.sortByField("age")
	fmt.Println(persons)

}
