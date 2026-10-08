module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/integration/.*\\.int-spec\\.ts$',
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  globalSetup: '<rootDir>/test/jest.global-setup.ts',
  globalTeardown: '<rootDir>/test/jest.global-teardown.ts',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!(uuid)/)'],
  testEnvironment: 'node',
  maxWorkers: 1,
  testTimeout: 30000,
};
