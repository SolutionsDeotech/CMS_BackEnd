import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nodeProcess = process.execPath

test('registered fallback users survive a backend process restart', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cms-registered-users-'))
  const usersFile = path.join(directory, 'registered-users.json')
  const env = { ...process.env, CMS_USERS_FILE: usersFile }

  try {
    const saveUser = spawnSync(nodeProcess, ['--input-type=module', '-e', `
      import store from './src/services/store.js'
      await store.addRegisteredUser({
        _id: 'usr-persist-test',
        email: 'persist@example.com',
        password: '$2b$10$stored-hash',
        userType: 'Content Writer',
      })
    `], { cwd: backendRoot, env, encoding: 'utf8' })
    assert.equal(saveUser.status, 0, saveUser.stderr)

    const loginProcess = spawnSync(nodeProcess, ['--input-type=module', '-e', `
      import store from './src/services/store.js'
      await store.loadRegisteredUsers()
      const user = store.users.find((item) => item.email === 'persist@example.com')
      if (!user || user.password !== '$2b$10$stored-hash') process.exit(1)
    `], { cwd: backendRoot, env, encoding: 'utf8' })
    assert.equal(loginProcess.status, 0, loginProcess.stderr)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
