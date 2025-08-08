const Router = require('koa-router');
const { register, login } = require('../controllers/userController');

const router = new Router({ prefix: '/api/users' });

// 用户注册
router.post('/register', register);

// 用户登录
router.post('/login', login);

module.exports = router;