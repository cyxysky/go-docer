FROM golang:1.24.5 AS builder

WORKDIR /app

# 复制go mod文件
COPY go.mod go.sum ./

# 下载依赖
RUN go env -w GOPROXY=https://mirrors.aliyun.com/goproxy/,direct
RUN go mod download

# 复制源代码
COPY *.go ./

# 构建应用
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o online-editor .

# 运行阶段
FROM alpine:latest

RUN apk --no-cache add ca-certificates git bash

WORKDIR /root/

# 从构建阶段复制二进制文件
COPY --from=builder /app/online-editor .

# 创建必要的目录
RUN mkdir -p /tmp/online-editor/workspaces /tmp/online-editor/images

# 暴露端口
EXPOSE 8080

# 运行应用
CMD ["./online-editor"] 