import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendDir = path.resolve(__dirname, '../..')

console.log('====================================================')
console.log('🔍 AUDITING ALL BACKEND IMPORTS & CASE SENSITIVITY')
console.log('====================================================')

const jsFiles = []
function findJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      findJsFiles(fullPath)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      jsFiles.push(fullPath)
    }
  }
}

findJsFiles(path.join(backendDir, 'src'))
jsFiles.push(path.join(backendDir, 'server.js'))

console.log(`Found ${jsFiles.length} JavaScript files to inspect.\n`)

let errorCount = 0

// Helper to check case sensitivity of each path segment against real filesystem
function verifyExactPathCase(targetPath) {
  const root = path.parse(targetPath).root
  let current = root
  const relative = path.relative(root, targetPath)
  const segments = relative.split(path.sep)

  for (const segment of segments) {
    if (!segment) continue
    const entries = fs.readdirSync(current)
    const exactMatch = entries.find((e) => e === segment)
    if (!exactMatch) {
      const caseInsensitiveMatch = entries.find((e) => e.toLowerCase() === segment.toLowerCase())
      if (caseInsensitiveMatch) {
        return {
          valid: false,
          issue: `Casing mismatch: import specifies '${segment}', but disk has '${caseInsensitiveMatch}'`,
        }
      } else {
        return {
          valid: false,
          issue: `Segment '${segment}' does not exist in '${current}'`,
        }
      }
    }
    current = path.join(current, segment)
  }
  return { valid: true }
}

for (const filePath of jsFiles) {
  const content = fs.readFileSync(filePath, 'utf8')
  const importRegex = /(?:import|export)\s+(?:[\w*\s{},$]+\s+from\s+)?['"](\.[^'"]+)['"]/g
  let match

  while ((match = importRegex.exec(content)) !== null) {
    const importSpecifier = match[1]
    const dir = path.dirname(filePath)
    let resolved = path.resolve(dir, importSpecifier)

    // Check if path has extension or needs .js
    if (!fs.existsSync(resolved) && fs.existsSync(resolved + '.js')) {
      resolved = resolved + '.js'
    }

    if (!fs.existsSync(resolved)) {
      console.error(`❌ [MISSING FILE] in ${path.relative(backendDir, filePath)}:`)
      console.error(`   Cannot find '${importSpecifier}' (resolved to: ${resolved})`)
      errorCount++
      continue
    }

    // Verify exact filesystem casing
    const caseCheck = verifyExactPathCase(resolved)
    if (!caseCheck.valid) {
      console.error(`❌ [CASING ERROR] in ${path.relative(backendDir, filePath)}:`)
      console.error(`   Import '${importSpecifier}' -> ${caseCheck.issue}`)
      errorCount++
      continue
    }
  }
}

if (errorCount === 0) {
  console.log('✅ ALL relative import paths and filenames match exact disk casing!')
} else {
  console.error(`\n❌ Found ${errorCount} import / casing errors.`)
  process.exit(1)
}

// Now test dynamically importing all modules to verify named/default exports
console.log('\n--- Dynamically importing all backend files ---')
for (const filePath of jsFiles) {
  // Skip seed runner or scripts that run immediately on execution
  if (filePath.includes('seedRunner.js') || filePath.includes('testIntegrationSecurity.js') || filePath.includes('auditImports.js')) {
    continue
  }
  try {
    const fileUrl = new URL(`file://${filePath.replace(/\\/g, '/')}`)
    await import(fileUrl.href)
    console.log(`  ✅ Loaded: ${path.relative(backendDir, filePath)}`)
  } catch (err) {
    console.error(`  ❌ Failed to load ${path.relative(backendDir, filePath)}: ${err.message}`)
    errorCount++
  }
}

if (errorCount === 0) {
  console.log('\n🎉 ALL backend files loaded successfully with zero import errors!')
  process.exit(0)
} else {
  console.error(`\n❌ Total errors: ${errorCount}`)
  process.exit(1)
}

