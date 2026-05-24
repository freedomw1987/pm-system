import { prisma } from './src/utils/prisma'
const { v4: uuidv4 } = await import('uuid')

const result = await prisma.$executeRaw`
  INSERT INTO attachments (id, "entity_type", "entity_id", filename, "stored_path", "mime_type", "file_size", "uploaded_by_id", project_id, created_at)
  VALUES (
    ${uuidv4()},
    'project',
    '9c6c69f4-212d-4ece-868e-11f4cbeec500',
    'test.txt',
    'test.bin',
    'text/plain',
    100,
    '59b34f95-9c67-4df4-a378-5b9a3e8851ed',
    '9c6c69f4-212d-4ece-868e-11f4cbeec500',
    NOW()
  )
`
console.log('Result:', result)