// Runs inside every test file: close that file's Redis connection at the end, so Jest can exit.
afterAll(() => require('../../src/config/redis').disconnect());
