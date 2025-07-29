package main

import (
	"math/big"
)

type matrix [5][5]*big.Int

// 生成单位矩阵
func indetMatrix(a int) *matrix {
	result := &matrix{}
	for i := 0; i < a; i++ {
		for j := 0; j < a; j++ {
			result[i][j] = big.NewInt(int64(0))
			if i == j {
				result[i][j] = big.NewInt(int64(1))
			}
		}
	}
	return result
}

// 矩阵乘法
func (m *matrix) mul(a, b *matrix) *matrix {
	result := &matrix{}
	for i := 0; i < 4; i++ {
		for j := 0; j < 4; j++ {
			result[i][j] = big.NewInt(int64(0))
			for k := 0; k < 4; k++ {
				result[i][j].Add(result[i][j], big.NewInt(0).Mul(a[i][k], b[k][j]))
			}
		}
	}
	return result
}

func main() {

}
