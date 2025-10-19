// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-whatsapp-broadcast'
process.env.REDIS_URL = 'redis://localhost:6379/1'
process.env.PORT = '5001'

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error
const originalConsoleWarn = console.warn
const originalConsoleLog = console.log

beforeAll(() => {
  console.error = (...args) => {
    // Only show errors that aren't expected in tests
    if (
      typeof args[0] === 'string' &&
      !args[0].includes('Warning:') &&
      !args[0].includes('MongoServerError')
    ) {
      originalConsoleError.call(console, ...args)
    }
  }
  
  console.warn = (...args) => {
    // Suppress warnings in tests
    if (
      typeof args[0] === 'string' &&
      !args[0].includes('DeprecationWarning')
    ) {
      originalConsoleWarn.call(console, ...args)
    }
  }
  
  console.log = (...args) => {
    // Suppress logs in tests unless they're test-related
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Test') || args[0].includes('✓') || args[0].includes('✗'))
    ) {
      originalConsoleLog.call(console, ...args)
    }
  }
})

afterAll(() => {
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
  console.log = originalConsoleLog
})

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
})

// Global test timeout
jest.setTimeout(10000)
