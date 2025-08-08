// 模拟用户数据
const users = [];

const createUser = async (userData) => {
  // 实际项目中应该加密密码
  const user = { id: users.length + 1, ...userData };
  users.push(user);
  return user;
};

const authenticateUser = async ({ username, password }) => {
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) throw new Error('Invalid credentials');
  // 实际项目中应该生成JWT
  return 'mock-token';
};

module.exports = { createUser, authenticateUser };