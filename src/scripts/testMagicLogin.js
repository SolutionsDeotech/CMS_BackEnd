import assert from 'node:assert/strict'
import magicAuthService from '../services/magicAuthService.js'

async function runMagicAuthTests() {
  console.log('--- Testing MagicAuthService ---')

  // 1. Token generation
  const superAdmin = { _id: 'admin-123', email: 'super@deotech.com', name: 'SuperAdmin' }
  const res = magicAuthService.createMagicLoginToken({
    clientId: 'cli-test-1',
    superAdminUser: superAdmin,
  })

  assert.ok(res.token, 'Token must be generated')
  assert.equal(typeof res.token, 'string')
  assert.equal(res.token.length, 64, 'Token must be 32 bytes hex (64 chars)')
  assert.equal(res.expiresIn, 900, 'Expiration must be 900 seconds (15 minutes)')
  assert.ok(res.expiresAt > Date.now() + 14 * 60 * 1000, 'Expires at must be 15 mins in future')
  console.log('  ✅ [PASS] Magic login token creation with 15-minute expiration')

  // 2. Peek token
  const peek = magicAuthService.peekToken(res.token)
  assert.equal(peek.clientId, 'cli-test-1')
  assert.equal(peek.superAdminEmail, 'super@deotech.com')
  console.log('  ✅ [PASS] Read-only peek token before consumption')

  // 3. Consume token
  const consume = magicAuthService.consumeMagicLoginToken(res.token)
  assert.equal(consume.valid, true)
  assert.equal(consume.payload.clientId, 'cli-test-1')
  assert.equal(consume.payload.superAdminEmail, 'super@deotech.com')
  console.log('  ✅ [PASS] Successful single-use token consumption')

  // 4. Cannot reuse consumed token
  const reuse = magicAuthService.consumeMagicLoginToken(res.token)
  assert.equal(reuse.valid, false)
  assert.ok(reuse.error.includes('already been consumed'), 'Replay must be prevented')
  console.log('  ✅ [PASS] Replay prevention (single-use enforced)')

  // 5. Non-existent token
  const fake = magicAuthService.consumeMagicLoginToken('non-existent-token')
  assert.equal(fake.valid, false)
  console.log('  ✅ [PASS] Non-existent token rejected')

  // 6. Expired token simulation
  const expiredRes = magicAuthService.createMagicLoginToken({
    clientId: 'cli-test-2',
    superAdminUser: superAdmin,
  })
  // Artificially age the token
  const stored = magicAuthService.tokenStore.get(expiredRes.token)
  stored.expiresAt = Date.now() - 1000

  const expiredConsume = magicAuthService.consumeMagicLoginToken(expiredRes.token)
  assert.equal(expiredConsume.valid, false)
  assert.ok(expiredConsume.error.includes('expired'), 'Expired token must report expiration')
  console.log('  ✅ [PASS] Expired token rejection (>15 minutes)')

  console.log('🎉 ALL MAGIC AUTH SERVICE TESTS PASSED!')
}

runMagicAuthTests().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})

