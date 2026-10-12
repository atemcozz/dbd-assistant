module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // Deletes the shared test database once, after all spec files finish.
  globalTeardown: './test/global-teardown.js',
  // Serial execution: every spec file shares one SQLite file, so
  // parallel workers would delete each other's rows mid-test.
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  passWithNoTests: true,
}
