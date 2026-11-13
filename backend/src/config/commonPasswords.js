// Passwords that pass the character rules but are among the most guessed (step 6). Compared case-insensitively.
// Short on purpose: it blocks the obvious; bcrypt and the rate limits handle the rest.
module.exports = new Set([
  'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'passw0rd1', 'p4ssw0rd', 'pa55w0rd',
  'welcome1', 'welcome12', 'welcome123', 'welcome2024', 'welcome2025', 'welcome2026',
  'qwerty123', 'qwerty1234', 'qwertyuiop1', 'asdfgh123', 'zxcvbnm1',
  'abc12345', 'abcd1234', 'abcdef123', 'abcdefg1', 'aa123456', 'a1b2c3d4',
  'admin123', 'admin1234', 'administrator1', 'root1234', 'changeme1', 'changeme123',
  'letmein1', 'letmein123', 'iloveyou1', 'iloveyou123', 'sunshine1', 'princess1', 'football1', 'baseball1', 'monkey123',
  'dragon123', 'master123', 'superman1', 'trustno1', 'hello123', 'login123', 'secret12', 'test1234', 'testing123',
  'india123', 'india@123', 'bharat123', 'mumbai123', 'delhi123', 'bangalore1', 'qwerty@123', 'pass@123', 'admin@123',
  'ledgerline1', 'ledgerline123', 'ledger123', 'banking123', 'bank1234', 'money123',
]);
