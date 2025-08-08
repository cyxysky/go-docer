const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const userRouter = require('./routes/userRoutes');

const app = new Koa();

// 中间件
app.use(bodyParser());

// 路由
app.use(userRouter.routes()).use(userRouter.allowedMethods());

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;