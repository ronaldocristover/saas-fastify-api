import argon2 from 'argon2'

// argon2id is the default hashing algorithm: resistant to GPU cracking and
// side-channel timing attacks. Group (a constant pool) is unnecessary for a
// single-service workload, so keep the default and only set a sane memory bound.
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024, // 19 MiB (OWASP minimum)
    timeCost: 2,
    parallelism: 1,
  })
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain)
}