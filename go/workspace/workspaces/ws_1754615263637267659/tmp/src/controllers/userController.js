const userService = require('../services/userService');

const register = async (ctx) => {
  try {
    const user = await userService.createUser(ctx.request.body);
    ctx.status = 201;
    ctx.body = { success: true, data: user };
  } catch (error) {
    ctx.status = 400;
    ctx.body = { success: false, message: error.message };
  }
};

const login = async (ctx) => {
  try {
    const token = await userService.authenticateUser(ctx.request.body);
    ctx.status = 200;
    ctx.body = { success: true, token };
  } catch (error) {
    ctx.status = 401;
    ctx.body = { success: false, message: error.message };
  }
};

module.exports = { register, login };